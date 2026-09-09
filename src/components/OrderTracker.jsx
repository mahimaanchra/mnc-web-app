/**
 * OrderTracker.jsx
 *
 * Two surfaces:
 *   1. Floating pill  — always visible on the right edge when an active order exists.
 *      Tapping it opens the sheet. Never sits near the bottom cart bar.
 *   2. Slide-up sheet — shows up to 7 recent orders (last 30 days) 
 *      with live text-based status badges and order history.
 *
 * Props:
 *   phone               – string | null
 *   open                – boolean          (controlled by parent)
 *   onOpenChange        – fn(boolean)
 *   onAddMore           – fn(order)        open OrderModificationSheet
 *   onActiveOrderChange – fn(order|null)   called whenever the active order changes
 *                                          (parent uses this for the interception modal)
 */

import { useState, useEffect, useRef } from "react";
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
import SessionManager from "../utils/sessionManager";

// ─── Status badge config ───────────────────────────────────────────────────────

const STATUS_CONFIG = {
  Open: {
    label:  "", // Remove "Open Tab" text
    icon:   <Clock         size={12} />,
    pill:   "bg-gradient-to-r from-amber-300/20 to-amber-400/20 text-amber-200 border border-amber-300/40",
    accent: "border-l-4 border-amber-300",
    floatBg: "bg-gradient-to-r from-amber-400 to-amber-500 border border-amber-300",
    floatText: "text-black",
    cardGlow: "ring-2 ring-amber-300/60 shadow-xl shadow-amber-300/25 bg-gradient-to-br from-amber-50/8 to-amber-100/12", // Enhanced glowing effect for active orders
  },
  Pending: {
    label:  "Preparing Order",
    icon:   <Clock         size={12} />,
    pill:   "bg-gradient-to-r from-orange-500/20 to-amber-500/20 text-amber-200 border border-amber-400/40",
    accent: "border-l-4 border-amber-400",
    floatBg: "bg-gradient-to-r from-orange-500 to-amber-500 border border-amber-400",
    floatText: "text-white",
    cardGlow: "", // No glow for non-open orders
  },
  Preparing: {
    label:  "Cooking Now",
    icon:   <ChefHat       size={12} />,
    pill:   "bg-gradient-to-r from-purple-500/20 to-indigo-500/20 text-indigo-200 border border-indigo-400/40",
    accent: "border-l-4 border-indigo-400",
    floatBg: "bg-gradient-to-r from-purple-500 to-indigo-500 border border-indigo-400",
    floatText: "text-white",
    cardGlow: "", // No glow for non-open orders
  },
  Ready: {
    label:  "Ready for Pickup! 🎉",
    icon:   <CheckCircle2  size={12} />,
    pill:   "bg-gradient-to-r from-emerald-500/25 to-green-400/25 text-emerald-100 border border-emerald-400/60",
    accent: "border-l-4 border-emerald-400",
    floatBg: "bg-gradient-to-r from-emerald-500 to-green-400 border border-emerald-300",
    floatText: "text-white",
    cardGlow: "", // No glow for non-open orders
  },
  Completed: {
    label:  "Order Completed ✓",
    icon:   <CircleDollarSign size={12} />,
    pill:   "bg-gradient-to-r from-slate-600/25 to-gray-600/25 text-slate-300 border border-slate-400/40",
    accent: "border-l-4 border-slate-400",
    floatBg: "bg-gradient-to-r from-slate-600 to-gray-600 border border-slate-400",
    floatText: "text-white",
    cardGlow: "", // No glow for non-open orders
  },
};

// ─── Status badge pill ─────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.Pending;
  
  // Don't render badge if label is empty (like for Open status)
  if (!cfg.label) return null;
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                      text-[11px] font-bold tracking-wide ${cfg.pill}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── Single order card ─────────────────────────────────────────────────────────

function TrackerOrderCard({ order, onAddMore, dimmed = false }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.Pending;

  const isModifiable      = order.status === "Pending" || order.status === "Preparing";
  const modifications     = order.modifications ?? [];
  const hasAddons         = modifications.length > 0;
  const displayTotal      = order.totalPrice ?? 0;
  const addedDisplayTotal = modifications.reduce(
    (s, m) => s + (m.addedPrice ?? (m.items ?? []).reduce((ss, it) => ss + it.price * it.qty, 0)),
    0,
  );

  return (
    <div className={`rounded-2xl overflow-hidden ${cfg.accent} 
                     ${order.status === "Open" 
                       ? "bg-gradient-to-br from-[#2a2a2a] via-[#1f1f1f] to-[#1a1a1a] border-2 border-amber-300/30" 
                       : "bg-gradient-to-br from-[#1a1a1a] to-[#0f0f0f] border border-[#2e2e2e]/50"}
                     transition-all duration-300 ${dimmed ? "opacity-60" : ""} 
                     ${order.status === "Open" ? cfg.cardGlow : ""}
                     shadow-lg ${order.status === "Open" ? "shadow-amber-300/10" : "shadow-black/20"}`}>

      {/* Header */}
      <div className="px-4 pt-3.5 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
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
          {order.createdAt?.toDate && (
            <p className="text-[#9a9a9a] text-[11px]">
              {order.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* "Open" status info - show if items have different statuses */}
      {order.status === "Open" && order.items && (
        <div className="mx-4 mb-3 px-4 py-3 rounded-xl bg-amber-300/10 border border-amber-300/30 backdrop-blur-sm">
          <p className="text-amber-300 text-xs font-bold text-center">📋 Tab is open - you can add more items!</p>
        </div>
      )}

      {/* Expand / collapse */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3
                   border-t border-[#2e2e2e]/30 text-[#9a9a9a] text-xs
                   hover:text-white hover:bg-[#2a2a2a]/30 transition-all min-h-[44px]"
      >
        <span className="font-medium">
          {order.items?.length ?? 0} item{(order.items?.length ?? 0) !== 1 ? "s" : ""}
          {hasAddons && (
            <span className="ml-1.5 text-amber-300 font-semibold">
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
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-1">
              <p className="text-[10px] font-bold text-[#9a9a9a] uppercase tracking-wider pt-1 pb-0.5">
                Original Order
              </p>
              {(order.items ?? []).map((it, i) => (
                <div key={i} className="flex items-center justify-between text-xs gap-2">
                  <span className="text-[#c0c0c0] flex-1 min-w-0 truncate">
                    {it.qty}× {it.itemName}
                    {it.variantLabel && <span className="opacity-55"> ({it.variantLabel})</span>}
                    {it.isFreeStreak && (
                      <span className="ml-1 text-[9px] font-black bg-amber-400
                                       text-amber-950 px-1 py-0.5 rounded">FREE</span>
                    )}
                  </span>
                  <span className={`font-semibold flex-shrink-0 ${it.isFreeStreak ? "text-green-400" : "text-[#9a9a9a]"}`}>
                    {it.isFreeStreak ? "FREE" : `₹${it.price * it.qty}`}
                  </span>
                </div>
              ))}

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
                        {it.variantLabel && <span className="opacity-60 font-normal"> ({it.variantLabel})</span>}
                      </span>
                      <span className="text-[#f5a623] font-bold flex-shrink-0">₹{it.price * it.qty}</span>
                    </div>
                  ))}
                  {mod.note && (
                    <p className="text-[10px] text-[#f5a623]/50 italic mt-0.5">Note: "{mod.note}"</p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="px-4 pb-4 flex items-center justify-between gap-3 border-t border-[#2e2e2e] pt-3">
        <div>
          <span className="text-[#9a9a9a] text-xs">Total</span>
          <span className="text-white font-bold text-sm ml-2">₹{displayTotal}</span>
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
            <PlusCircle size={13} />
            Add More
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main OrderTracker ─────────────────────────────────────────────────────────

export default function OrderTracker({
  phone,
  open,
  onOpenChange,
  onAddMore,
  onActiveOrderChange,   // fn(order | null) — parent tracks active order for interception
  hideFloatingWidget = false,   // option to hide the floating pill
}) {
  const [orders, setOrders] = useState([]);
  // Ref so the session-wipe check inside onSnapshot sees the current orders list
  // without needing it in the effect's dependency array.
  const ordersRef = useRef([]);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    if (!phone) return;

    const cutoff = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
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
        ? fetched.filter((o) => !o.tableNumber || String(o.tableNumber) === sessionTable)
        : fetched;

      // Wipe session when order is marked completed - ENHANCED RESET
      const prevOrders  = ordersRef.current;
      const hadActive   = prevOrders.some((o) => o.status === "Open");
      const nowHasActive = scoped.some((o) => o.status === "Open");
      
      // Use SessionManager for comprehensive reset
      if (hadActive && !nowHasActive) {
        console.log('🔄 OrderTracker: Order completed, triggering session reset');
        SessionManager.handleOrderCompletion();
      }

      setOrders(scoped);
    });

    return unsub;
  }, [phone]);

  // Active = most recent Open order (orders can have items in various states)
  const activeOrder = orders.find(
    (o) => o.status === "Open",
  ) ?? null;

  // Up to 7 most-recent orders shown in the sheet (active + completed, ordered desc)
  const displayOrders = orders.slice(0, 7);

  // Notify parent whenever the active order identity or status changes
  const prevActiveRef = useRef(null);
  useEffect(() => {
    const prev = prevActiveRef.current;
    const changed =
      (prev?.id !== activeOrder?.id) || (prev?.status !== activeOrder?.status);
    if (changed) {
      prevActiveRef.current = activeOrder;
      onActiveOrderChange?.(activeOrder);
    }
  }, [activeOrder, onActiveOrderChange]);

  if (!phone) return null;

  const activeCfg = activeOrder ? (STATUS_CONFIG[activeOrder.status] ?? STATUS_CONFIG.Pending) : null;

  return (
    <>
      {/* ── Floating pill — right edge, vertically centred, never near cart bar ── */}
      <AnimatePresence>
        {activeOrder && !open && !hideFloatingWidget && (
          <motion.button
            key="tracker-pill"
            type="button"
            onClick={() => onOpenChange(true)}
            initial={{ x: 80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 22, stiffness: 280 }}
            className={`absolute right-2 top-1/2 -translate-y-1/2 z-40
                        flex flex-col items-center gap-1
                        px-2 py-2.5 rounded-l-2xl shadow-xl
                        ${activeCfg.floatBg}`}
            style={{ writingMode: "vertical-rl" }}
            aria-label="View active order"
          >
            <span className={`text-[11px] font-black tracking-wide ${activeCfg.floatText}`}
                  style={{ writingMode: "horizontal-tb" }}>
              {activeCfg.icon}
            </span>
            <span className={`text-[10px] font-bold ${activeCfg.floatText}`}
                  style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}>
              {activeOrder.status === "Open" ? "Order" : "Order"}
            </span>
            {/* Pulsing dot for open orders */}
            {activeOrder.status === "Open" && (
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Slide-up sheet ── */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="ot-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => onOpenChange(false)}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
            />

            <motion.div
              key="ot-sheet"
              initial={{ y: "100%", opacity: 0.8 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0.8 }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
              className="fixed inset-x-0 bottom-0 z-50 flex flex-col
                         bg-gradient-to-b from-[#0f0f0f] to-[#1a1a1a] border-t-2 border-amber-300/20 rounded-t-3xl
                         max-h-[85vh] overflow-hidden shadow-2xl shadow-black/50"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-12 h-1.5 rounded-full bg-amber-300/40" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4
                              border-b border-amber-300/10 bg-gradient-to-r from-[#1a1a1a] to-[#242424] flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-300/10 border border-amber-300/20 flex items-center justify-center">
                    <ClipboardList size={20} className="text-amber-300" />
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-lg">My Orders</h2>
                    <p className="text-amber-300/60 text-xs">Recent order history</p>
                  </div>
                  {activeOrder && <StatusBadge status={activeOrder.status} />}
                </div>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="p-2 rounded-xl text-[#9a9a9a] hover:text-white
                             hover:bg-amber-300/10 border border-transparent hover:border-amber-300/20 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body — up to 7 orders */}
              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 bg-gradient-to-b from-transparent to-[#0f0f0f]/50">
                {displayOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 text-center">
                    <PackageX size={36} className="text-[#3a3a3a] mb-3" />
                    <p className="text-[#9a9a9a] text-sm font-medium">No orders yet.</p>
                    <p className="text-[#555] text-xs mt-1 max-w-[200px] leading-relaxed">
                      Place an order and it will appear here.
                    </p>
                  </div>
                ) : (
                  displayOrders.map((order, idx) => {
                    const isActive = order.status === "Pending"
                      || order.status === "Preparing"
                      || order.status === "Ready";
                    return (
                      <div key={order.id}>
                        {/* Section label only before the first active / first completed */}
                        {idx === 0 && isActive && (
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
                            <p className="text-xs font-bold text-amber-300 uppercase tracking-widest">
                              Active Order
                            </p>
                            <div className="flex-1 h-px bg-amber-300/20" />
                          </div>
                        )}
                        {idx > 0 && !isActive &&
                          (displayOrders[idx - 1]?.status === "Pending"
                            || displayOrders[idx - 1]?.status === "Preparing"
                            || displayOrders[idx - 1]?.status === "Ready") && (
                          <div className="flex items-center gap-3 mt-6 mb-3">
                            <div className="w-2 h-2 rounded-full bg-[#555]" />
                            <p className="text-xs font-bold text-[#888] uppercase tracking-widest">
                              Order History
                            </p>
                            <div className="flex-1 h-px bg-[#333]" />
                          </div>
                        )}
                        {idx === 0 && !isActive && (
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-2 h-2 rounded-full bg-[#555]" />
                            <p className="text-xs font-bold text-[#888] uppercase tracking-widest">
                              Recent Orders
                            </p>
                            <div className="flex-1 h-px bg-[#333]" />
                          </div>
                        )}
                        <TrackerOrderCard
                          order={order}
                          onAddMore={onAddMore}
                          dimmed={!isActive}
                        />
                      </div>
                    );
                  })
                )}
              </div>

              {/* Safe-area spacer */}
              <div className="flex-shrink-0"
                   style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
