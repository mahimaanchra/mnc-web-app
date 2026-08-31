/**
 * OrderTracker.jsx
 *
 * Floating "My Orders" button + slide-up modal that shows every order
 * tied to the customer's verified phone number in real-time.
 *
 * Security model:
 *   • Firestore query is scoped to customerPhone == phone (verified at checkout)
 *   • Only orders from the last 24 hours are fetched — prevents cross-session leakage
 *     from stale localStorage data or shared devices
 *   • Client-side table guard: if the current session has a tableNumber, only orders
 *     matching that table (or orders with no tableNumber stored) are shown — eliminates
 *     edge cases where two tables share a phone number (e.g. staff testing)
 *   • If phone is empty/null the entire component returns null — no query fires at all
 *
 * Props:
 *   phone          – string | null   (localStorage.getItem("verifiedPhone"))
 *   onAddMore      – fn(order)       open the modification sheet for an active order
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  collection, query, where, orderBy, onSnapshot, Timestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";
import {
  X, ClipboardList, Clock, ChefHat, CheckCircle2,
  CircleDollarSign, PlusCircle, ChevronDown, ChevronUp,
  PackageX,
} from "lucide-react";

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  Pending: {
    label: "Pending",
    dot: "bg-yellow-400",
    badge: "bg-yellow-400/15 text-yellow-300 border-yellow-500/30",
    icon: <Clock size={12} />,
    step: 0,
  },
  Preparing: {
    label: "Preparing",
    dot: "bg-blue-400",
    badge: "bg-blue-400/15 text-blue-300 border-blue-500/30",
    icon: <ChefHat size={12} />,
    step: 1,
  },
  Ready: {
    label: "Ready!",
    dot: "bg-amber-400 animate-pulse",
    badge: "bg-amber-400/15 text-amber-300 border-amber-500/30",
    icon: <CheckCircle2 size={12} />,
    step: 2,
  },
  Completed: {
    label: "Completed",
    dot: "bg-green-400",
    badge: "bg-green-400/15 text-green-300 border-green-500/30",
    icon: <CircleDollarSign size={12} />,
    step: 3,
  },
};

const STEPS = ["Pending", "Preparing", "Ready", "Completed"];

// ─── Progress bar ──────────────────────────────────────────────────────────────

function StatusStepper({ status }) {
  const cfg  = STATUS_CONFIG[status] ?? STATUS_CONFIG.Pending;
  const step = cfg.step;
  return (
    <div className="flex items-center gap-1 mt-2.5">
      {STEPS.map((s, i) => {
        const done    = i <= step;
        const current = i === step;
        return (
          <div key={s} className="flex items-center flex-1">
            <div className={`flex-1 h-1 rounded-full transition-all duration-500
              ${done ? "bg-[#f5a623]" : "bg-[#2e2e2e]"}
              ${i === 0 ? "rounded-l-full" : ""}`} />
            <div
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all duration-500 z-10
                ${done ? "bg-[#f5a623]" : "bg-[#2e2e2e]"}
                ${current ? "ring-2 ring-[#f5a623]/40 scale-125" : ""}`}
            />
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-1 rounded-full transition-all duration-500
                ${i < step ? "bg-[#f5a623]" : "bg-[#2e2e2e]"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Single order card inside the tracker modal ───────────────────────────────

function TrackerOrderCard({ order, onAddMore }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.Pending;

  const isModifiable = order.status === "Pending" || order.status === "Preparing";
  const modifications = order.modifications ?? [];
  const hasAddons     = modifications.length > 0;

  // `order.totalPrice` is the single source of truth — Firestore already applied
  // `increment(addedTotal)` on every modification write, so we must NOT add
  // modification prices again here (that was the double-counting bug).
  const displayTotal = order.totalPrice ?? 0;

  // Compute how much was added across all modifications for the "+₹X added" callout.
  // This is purely cosmetic — it does NOT feed into displayTotal.
  const addedDisplayTotal = modifications.reduce(
    (s, m) => s + (m.addedPrice ?? (m.items ?? []).reduce((ss, it) => ss + it.price * it.qty, 0)),
    0,
  );

  return (
    <div className="bg-[#242424] border border-[#2e2e2e] rounded-2xl overflow-hidden">
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-bold text-sm">
                Table {order.tableNumber ?? "—"}
              </span>
              {order.isStreakOrder && (
                <span className="text-[10px] font-black bg-amber-400 text-amber-950
                                 px-1.5 py-0.5 rounded-md leading-tight">
                  🎁 STREAK
                </span>
              )}
            </div>
            {order.createdAt && (
              <p className="text-[#9a9a9a] text-xs mt-0.5">
                {order.createdAt.toDate
                  ? order.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : ""}
              </p>
            )}
          </div>

          <span className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1
                            rounded-full border ${cfg.badge}`}>
            {cfg.icon} {cfg.label}
          </span>
        </div>

        <StatusStepper status={order.status} />
      </div>

      {/* ── Items (collapsible) ── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5
                   border-t border-[#2e2e2e] text-[#9a9a9a] text-xs
                   hover:text-white transition-colors min-h-[40px]"
      >
        <span className="font-medium">
          {order.items?.length ?? 0} item{(order.items?.length ?? 0) !== 1 ? "s" : ""}
          {hasAddons && (
            <span className="ml-1.5 text-[#f5a623]">
              + {modifications.length} add-on{modifications.length > 1 ? "s" : ""}
            </span>
          )}
        </span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            key="items"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-1">

              {/* ── Original items label ── */}
              <p className="text-[10px] font-bold text-[#9a9a9a] uppercase tracking-wider pt-1 pb-0.5">
                Original Order
              </p>
              {(order.items ?? []).map((it, i) => (
                <div key={i} className="flex items-center justify-between text-xs gap-2">
                  <span className="text-[#c0c0c0] flex-1 min-w-0 truncate">
                    {it.qty}× {it.itemName}
                    {it.variantLabel && (
                      <span className="opacity-55"> ({it.variantLabel})</span>
                    )}
                    {it.isFreeStreak && (
                      <span className="ml-1 text-[9px] font-black bg-amber-400
                                       text-amber-950 px-1 py-0.5 rounded">FREE</span>
                    )}
                  </span>
                  <span className={`font-semibold flex-shrink-0
                                    ${it.isFreeStreak ? "text-green-400" : "text-[#9a9a9a]"}`}>
                    {it.isFreeStreak ? "FREE" : `₹${it.price * it.qty}`}
                  </span>
                </div>
              ))}

              {/* ── Modification batches — each clearly labelled ── */}
              {modifications.map((mod, mi) => (
                <div key={mi} className="mt-2.5">
                  {/* Divider label */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-[#f5a623] uppercase tracking-wider">
                      ✚ Added
                      {mod.addedAt
                        ? ` at ${
                            mod.addedAt.toDate
                              ? mod.addedAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                              : new Date(mod.addedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          }`
                        : ""}
                    </span>
                    <div className="flex-1 h-px bg-[#f5a623]/20" />
                  </div>
                  {(mod.items ?? []).map((it, i) => (
                    <div key={i} className="flex items-center justify-between text-xs gap-2">
                      <span className="text-amber-300 flex-1 min-w-0 truncate font-medium">
                        {it.qty}× {it.itemName}
                        {it.variantLabel && (
                          <span className="opacity-60 font-normal"> ({it.variantLabel})</span>
                        )}
                      </span>
                      <span className="text-[#f5a623] font-bold flex-shrink-0">
                        ₹{it.price * it.qty}
                      </span>
                    </div>
                  ))}
                  {mod.note && (
                    <p className="text-[10px] text-[#f5a623]/50 italic mt-0.5">
                      Note: "{mod.note}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Footer ── */}
      <div className="px-4 pb-4 flex items-center justify-between gap-3
                      border-t border-[#2e2e2e] pt-3">
        <div>
          <span className="text-[#9a9a9a] text-xs">Total</span>
          <span className="text-white font-bold text-base ml-2">₹{displayTotal}</span>
          {addedDisplayTotal > 0 && (
            <span className="text-[#f5a623] text-[10px] ml-1.5 font-semibold">
              (+₹{addedDisplayTotal} added)
            </span>
          )}
        </div>
        {isModifiable && (
          <button
            type="button"
            onClick={() => onAddMore(order)}
            className="flex items-center gap-1.5 bg-[#f5a623]/15 border border-[#f5a623]/40
                       text-[#f5a623] text-xs font-bold px-3 py-2 rounded-xl
                       hover:bg-[#f5a623]/25 transition-colors active:scale-95 min-h-[40px]"
          >
            <PlusCircle size={14} />
            Add More
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main OrderTracker ─────────────────────────────────────────────────────────

export default function OrderTracker({ phone, onAddMore }) {
  const [open,   setOpen]   = useState(false);
  const [orders, setOrders] = useState([]);

  // Real-time listener — fires only when we have a phone number
  useEffect(() => {
    // Guard: never fire a query without a verified phone — avoids returning all orders
    if (!phone) return;

    // Recency cutoff: only fetch orders placed in the last 24 hours.
    // This prevents stale localStorage phone numbers on shared devices from
    // surfacing orders belonging to a previous customer.
    const cutoff = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);

    const q = query(
      collection(db, "orders"),
      where("customerPhone", "==", phone),   // primary identity filter
      where("createdAt", ">=", cutoff),       // recency guard
      orderBy("createdAt", "desc"),
    );

    const unsub = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Client-side table guard: if this session has a table number, only surface
      // orders from that table. Orders without a tableNumber are always shown
      // (covers takeaway and orders placed before tableNumber was stored).
      const sessionTable = localStorage.getItem("tableNumber");
      const scoped = sessionTable
        ? fetched.filter(
            (o) =>
              !o.tableNumber ||                          // no table stored on order → show
              String(o.tableNumber) === sessionTable,    // same table → show
          )
        : fetched; // no table in session → show everything tied to the phone

      setOrders(scoped);
    });

    return unsub;
  }, [phone]);

  // Active = Pending or Preparing only — completed orders are never shown in this view
  const activeOrders = orders.filter(
    (o) => o.status === "Pending" || o.status === "Preparing",
  );
  const hasActive = activeOrders.length > 0;

  // Don't show the button if no phone has been verified this session
  if (!phone) return null;

  return (
    <>
      {/* ── Floating Pill Button ── */}
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 22, stiffness: 260, delay: 0.4 }}
        className={`fixed bottom-[80px] right-4 z-40 flex items-center gap-2
                    text-sm font-bold px-4 py-2.5 rounded-2xl shadow-xl
                    transition-colors active:scale-95 min-h-[48px]
                    ${hasActive
                      ? "bg-[#f5a623] text-[#1a1a1a] shadow-[#f5a623]/30"
                      : "bg-[#242424] text-white border border-[#3a3a3a]"}`}
      >
        <ClipboardList size={15} />
        My Orders
        {hasActive && (
          <span className="w-5 h-5 bg-[#1a1a1a]/25 rounded-full flex items-center justify-center
                           text-[11px] font-black">
            {activeOrders.length}
          </span>
        )}
      </motion.button>

      {/* ── Slide-up Modal ── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              key="ot-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
            />

            {/* Sheet */}
            <motion.div
              key="ot-sheet"
              initial={{ y: "100%", opacity: 0.8 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0.8 }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
              className="fixed inset-x-0 bottom-0 z-50 flex flex-col
                         bg-[#1e1e1e] border-t border-[#2e2e2e] rounded-t-3xl
                         max-h-[85vh] overflow-hidden"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-[#3a3a3a]" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#2e2e2e] flex-shrink-0">
                <div className="flex items-center gap-2">
                  <ClipboardList size={18} className="text-[#f5a623]" />
                  <h2 className="text-white font-bold text-base">My Orders</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg text-[#9a9a9a] hover:text-white hover:bg-[#2e2e2e] transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

                {activeOrders.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <PackageX size={38} className="text-[#3a3a3a] mb-3" />
                    <p className="text-[#9a9a9a] text-sm font-medium">No active orders.</p>
                    <p className="text-[#555] text-xs mt-1 max-w-[220px] leading-relaxed">
                      Your current order will appear here once you place one.
                    </p>
                  </div>
                )}

                {/* Active orders only — Pending / Preparing */}
                {activeOrders.map((order) => (
                  <TrackerOrderCard
                    key={order.id}
                    order={order}
                    onAddMore={(o) => { setOpen(false); onAddMore(o); }}
                  />
                ))}
              </div>

              {/* Bottom safe area padding */}
              <div className="flex-shrink-0 pb-safe" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
