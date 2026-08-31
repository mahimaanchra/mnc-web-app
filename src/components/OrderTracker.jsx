/**
 * OrderTracker.jsx
 *
 * Slide-up "My Orders" modal tied to the customer's verified phone number.
 *
 * Security model:
 *   • Firestore query scoped to customerPhone == phone + 24-hour recency guard
 *   • Client-side table guard filters out other tables sharing the same phone
 *   • No query fires at all if phone is empty/null
 *
 * Display model:
 *   • Active section  — current Pending / Preparing order (1 at a time)
 *   • Last served     — single most-recent Completed order for receipt reference
 *   • Status shown as a bold text badge (no progress bar)
 *
 * Props:
 *   phone        – string | null
 *   open         – boolean
 *   onOpenChange – fn(boolean)
 *   onAddMore    – fn(order)
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

// ─── Status badge config ───────────────────────────────────────────────────────

const STATUS_CONFIG = {
  Pending: {
    label:     "Pending",
    icon:      <Clock       size={13} />,
    // pill colours — dark-theme friendly
    pill:      "bg-yellow-400/15 text-yellow-300 border border-yellow-500/35",
    // subtle left-border accent on the card
    accent:    "border-l-2 border-yellow-500/50",
  },
  Preparing: {
    label:     "Preparing",
    icon:      <ChefHat     size={13} />,
    pill:      "bg-blue-400/15 text-blue-300 border border-blue-500/35",
    accent:    "border-l-2 border-blue-500/50",
  },
  Ready: {
    label:     "Ready! 🎉",
    icon:      <CheckCircle2 size={13} />,
    pill:      "bg-amber-400/20 text-amber-200 border border-amber-400/50",
    accent:    "border-l-2 border-amber-400",
  },
  Completed: {
    label:     "Served ✓",
    icon:      <CircleDollarSign size={13} />,
    pill:      "bg-green-500/15 text-green-300 border border-green-500/30",
    accent:    "border-l-2 border-green-500/40",
  },
};

// ─── Status badge pill ─────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.Pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full
                      text-xs font-bold tracking-wide ${cfg.pill}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── Single order card ─────────────────────────────────────────────────────────

function TrackerOrderCard({ order, onAddMore, dimmed = false }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.Pending;

  const isModifiable    = order.status === "Pending" || order.status === "Preparing";
  const modifications   = order.modifications ?? [];
  const hasAddons       = modifications.length > 0;
  const displayTotal    = order.totalPrice ?? 0;
  const addedDisplayTotal = modifications.reduce(
    (s, m) => s + (m.addedPrice ?? (m.items ?? []).reduce((ss, it) => ss + it.price * it.qty, 0)),
    0,
  );

  return (
    <div className={`rounded-2xl overflow-hidden transition-opacity
                     ${cfg.accent}
                     ${dimmed ? "opacity-60" : ""}
                     bg-[#242424] border border-[#2e2e2e]`}>

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Table / mode line */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-white font-bold text-sm leading-tight">
              {order.orderMode === "takeaway"
                ? "🛍️ Takeaway"
                : `Table ${order.tableNumber ?? "—"}`}
            </span>
            {order.isStreakOrder && (
              <span className="text-[10px] font-black bg-amber-400 text-amber-950
                               px-1.5 py-0.5 rounded-md leading-tight">
                🎁 STREAK
              </span>
            )}
          </div>

          {/* Time */}
          {order.createdAt?.toDate && (
            <p className="text-[#9a9a9a] text-[11px]">
              {order.createdAt.toDate().toLocaleTimeString([], {
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          )}
        </div>

        {/* Bold status badge — replaces the old progress bar */}
        <StatusBadge status={order.status} />
      </div>

      {/* "Ready" pulse banner */}
      {order.status === "Ready" && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-xl bg-amber-400/10 border border-amber-400/30
                        animate-pulse text-center">
          <p className="text-amber-300 text-xs font-bold">
            🔔 Your order is ready — please collect!
          </p>
        </div>
      )}

      {/* ── Expand / collapse items ── */}
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
              +{modifications.length} add-on{modifications.length > 1 ? "s" : ""}
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
              {/* Original items */}
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

              {/* Modification batches */}
              {modifications.map((mod, mi) => (
                <div key={mi} className="mt-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-[#f5a623] uppercase tracking-wider">
                      ✚ Added Items
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

export default function OrderTracker({ phone, open, onOpenChange, onAddMore }) {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    if (!phone) return;

    const cutoff = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    const q = query(
      collection(db, "orders"),
      where("customerPhone", "==", phone),
      where("createdAt", ">=", cutoff),
      orderBy("createdAt", "desc"),
    );

    const unsub = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Client-side table guard
      const sessionTable = localStorage.getItem("tableNumber");
      const scoped = sessionTable
        ? fetched.filter(
            (o) => !o.tableNumber || String(o.tableNumber) === sessionTable,
          )
        : fetched;

      // Wipe session keys when active order transitions to Completed
      const hadActive = orders.some(
        (o) => o.status === "Pending" || o.status === "Preparing",
      );
      const hasActive = scoped.some(
        (o) => o.status === "Pending" || o.status === "Preparing",
      );
      if (hadActive && !hasActive) {
        localStorage.removeItem("tableNumber");
        localStorage.removeItem("orderMode");
      }

      setOrders(scoped);
    });

    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  // Strictly one active order (most recent Pending/Preparing)
  const activeOrder = orders.find(
    (o) => o.status === "Pending" || o.status === "Preparing" || o.status === "Ready",
  ) ?? null;

  // Single most-recent completed order for receipt reference
  const lastCompleted = orders.find((o) => o.status === "Completed") ?? null;

  if (!phone) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="ot-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
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
            <div className="flex items-center justify-between px-5 py-3
                            border-b border-[#2e2e2e] flex-shrink-0">
              <div className="flex items-center gap-2">
                <ClipboardList size={18} className="text-[#f5a623]" />
                <h2 className="text-white font-bold text-base">My Orders</h2>
                {activeOrder && (
                  <StatusBadge status={activeOrder.status} />
                )}
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="p-1.5 rounded-lg text-[#9a9a9a] hover:text-white
                           hover:bg-[#2e2e2e] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

              {/* ── Active order ── */}
              {activeOrder ? (
                <section>
                  <p className="text-[10px] font-bold text-[#f5a623] uppercase
                                tracking-widest mb-2">
                    Current Order
                  </p>
                  <TrackerOrderCard
                    order={activeOrder}
                    onAddMore={onAddMore}
                  />
                </section>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <PackageX size={38} className="text-[#3a3a3a] mb-3" />
                  <p className="text-[#9a9a9a] text-sm font-medium">No active order.</p>
                  <p className="text-[#555] text-xs mt-1 max-w-[200px] leading-relaxed">
                    Place an order and it will appear here.
                  </p>
                </div>
              )}

              {/* ── Last completed order (receipt reference) ── */}
              {lastCompleted && (
                <section>
                  <p className="text-[10px] font-bold text-[#9a9a9a] uppercase
                                tracking-widest mb-2">
                    Last Served
                  </p>
                  <TrackerOrderCard
                    order={lastCompleted}
                    onAddMore={() => {}}
                    dimmed
                  />
                </section>
              )}
            </div>

            {/* Safe-area spacer */}
            <div className="flex-shrink-0"
                 style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
