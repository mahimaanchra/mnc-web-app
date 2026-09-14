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
  CircleDollarSign,
  PackageX, Plus,
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

// ─── Group orders by date for clean section headers ─────────────────────────

function groupOrdersByDate(orders) {
  const groups = {};
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
  
  orders.forEach(order => {
    if (!order.createdAt?.toDate) return;
    
    const date = order.createdAt.toDate();
    
    // Filter to only last 7 days
    if (date < sevenDaysAgo) return;
    
    const dateKey = date.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: '2-digit', 
      year: '2-digit' 
    });
    
    if (!groups[dateKey]) {
      groups[dateKey] = {
        date: dateKey,
        time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        fullDate: date,
        orders: []
      };
    }
    
    groups[dateKey].orders.push(order);
  });
  
  // Sort groups by date (most recent first) and limit to 7 days with actual orders
  return Object.values(groups)
    .sort((a, b) => b.fullDate - a.fullDate)
    .slice(0, 7);
}

// ─── Individual order item for clean item-level re-ordering ─────────────────────────────────────────

function OrderHistoryItemRow({ item, onQuickAdd, items }) {
  const getItemThumbnail = (itemId) => {
    const menuItem = items.find(i => i.id === itemId);
    return menuItem?.imageUrl;
  };

  const handleAddItem = () => {
    if (!onQuickAdd) return;
    
    const menuItem = items.find(mi => mi.id === item.itemId);
    if (menuItem && menuItem.inStock) {
      const variant = menuItem.variants?.find(v => v.label === item.variantLabel) || 
                     { label: item.variantLabel || 'Regular', price: item.price };
      
      if (variant.inStock !== false) {
        onQuickAdd({
          itemId: item.itemId,
          itemName: item.itemName,
          variantLabel: item.variantLabel,
          price: variant.price || item.price,
          addons: item.addons || []
        });
      }
    }
  };

  const thumbnail = getItemThumbnail(item.itemId);
  const menuItem = items.find(i => i.id === item.itemId);
  const isAvailable = menuItem?.inStock && 
    (!item.variantLabel || menuItem.variants?.find(v => v.label === item.variantLabel)?.inStock !== false);

  return (
    <div className="flex items-center gap-3 py-2 border-b border-zinc-700 last:border-b-0">
      {/* Thumbnail */}
      <div className="w-12 h-12 rounded-lg bg-zinc-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {thumbnail ? (
          <img 
            src={thumbnail} 
            alt={item.itemName}
            className="w-full h-full object-cover"
            onError={(e) => { 
              e.target.style.display = 'none';
              e.target.parentNode.innerHTML = '<div class="text-zinc-400 text-lg">🍽️</div>';
            }}
          />
        ) : (
          <div className="text-zinc-400 text-lg">🍽️</div>
        )}
      </div>
      
      {/* Item Details */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-white truncate">
          {item.qty > 1 && <span className="text-amber-400 font-semibold">{item.qty}× </span>}
          {item.itemName}
        </div>
        {item.variantLabel && (
          <div className="text-sm text-zinc-400">{item.variantLabel}</div>
        )}
      </div>
      
      {/* Price and Add Button */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right">
          <div className="font-semibold text-white">₹{item.price * item.qty}</div>
        </div>
        <button
          onClick={handleAddItem}
          disabled={!isAvailable}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
            isAvailable 
              ? 'bg-amber-500 hover:bg-amber-600 text-black' 
              : 'bg-zinc-600 text-zinc-400 cursor-not-allowed'
          }`}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

function TrackerOrderCard({ order, onAddMore, dimmed = false, isActive = false, items = [] }) {
  const isModifiable = order.status === "Pending" || order.status === "Preparing";
  const displayTotal = order.totalPrice ?? 0;

  const getItemThumbnail = (itemId) => {
    const menuItem = items.find(item => item.id === itemId);
    return menuItem?.imageUrl || null;
  };

  // Dark theme card styling with optional glowing border for active orders
  const cardClasses = `rounded-2xl overflow-hidden transition-all duration-300 ${dimmed ? "opacity-60" : ""} 
                       ${isActive 
                         ? "bg-zinc-800 border-2 border-amber-400 shadow-lg shadow-amber-400/20" 
                         : "bg-zinc-800 border border-zinc-700"}
                       shadow-sm`;

  return (
    <div className={cardClasses}>
      {/* Header with Order Info */}
      <div className="px-4 pt-4 pb-3 border-b border-zinc-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-white">
              {order.orderMode === "takeaway" ? "🛍️ Takeaway" : `Table ${order.tableNumber ?? "—"}`}
            </div>
            {order.isStreakOrder && (
              <span className="text-xs font-bold bg-amber-500 text-amber-950 px-2 py-1 rounded-full">
                🎁 STREAK
              </span>
            )}
            {isActive && (
              <span className="text-xs font-bold bg-green-500 text-green-950 px-2 py-1 rounded-full animate-pulse">
                ● Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-lg font-bold text-white">₹{displayTotal}</div>
              {order.createdAt?.toDate && (
                <div className="text-xs text-zinc-400">
                  {order.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
            {isModifiable && (
              <button
                onClick={() => onAddMore(order)}
                className="bg-amber-500 hover:bg-amber-600 text-black text-xs font-semibold
                           px-3 py-2 rounded-full transition-colors"
              >
                Add More
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Flat Item List - Clean chronological structure */}
      <div className="p-4">
        {order.items?.map((item, idx) => {
          const thumbnail = getItemThumbnail(item.itemId);

          return (
            <div key={idx} className="flex items-center gap-3 py-2 border-b border-zinc-700 last:border-b-0">
              {/* Thumbnail */}
              <div className="w-12 h-12 rounded-lg bg-zinc-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {thumbnail ? (
                  <img 
                    src={thumbnail} 
                    alt={item.itemName}
                    className="w-full h-full object-cover"
                    onError={(e) => { 
                      e.target.style.display = 'none';
                      e.target.parentNode.innerHTML = '<div class="text-zinc-400 text-lg">🍽️</div>';
                    }}
                  />
                ) : (
                  <div className="text-zinc-400 text-lg">🍽️</div>
                )}
              </div>
              
              {/* Item Details */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white truncate">
                  {item.qty > 1 && <span className="text-amber-400 font-semibold">{item.qty}× </span>}
                  {item.itemName}
                </div>
                {item.variantLabel && (
                  <div className="text-sm text-zinc-400">{item.variantLabel}</div>
                )}
                {item.isFreeStreak && (
                  <span className="inline-block text-xs font-bold bg-green-500 text-green-950 px-2 py-0.5 rounded-full mt-1">
                    FREE
                  </span>
                )}
              </div>
              
              {/* Price */}
              <div className="text-right flex-shrink-0">
                <div className={`font-semibold ${item.isFreeStreak ? "text-green-400" : "text-white"}`}>
                  {item.isFreeStreak ? "FREE" : `₹${item.price * item.qty}`}
                </div>
              </div>
            </div>
          );
        })}

        {/* Show added items from modifications if any */}
        {order.modifications?.map((mod, mi) => (
          <div key={mi} className="mt-4 pt-3 border-t border-amber-500/20">
            <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">
              ✚ Added Items
            </div>
            {mod.items?.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 py-2 border-b border-zinc-700 last:border-b-0">
                <div className="w-12 h-12 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <div className="text-amber-400 text-lg">🍽️</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white truncate">
                    {item.qty > 1 && <span className="text-amber-400 font-semibold">{item.qty}× </span>}
                    {item.itemName}
                  </div>
                  {item.variantLabel && (
                    <div className="text-sm text-zinc-400">{item.variantLabel}</div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-semibold text-amber-400">₹{item.price * item.qty}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
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
  onQuickAdd,            // fn(item) — for quick-adding items from history
  items = [],            // menu items for thumbnails and availability check
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

      // Client-side table guard using SessionManager
      const sessionState = SessionManager.getSessionState();
      const sessionTable = sessionState.tableNumber;
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

  // Split orders into active and completed
  const completedOrders = orders.filter(o => o.status === "Completed");
  const groupedHistory = groupOrdersByDate(completedOrders);

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
            className={`fixed right-4 top-1/2 -translate-y-1/2 z-40
                        flex items-center gap-2 px-4 py-3 rounded-full shadow-xl
                        ${activeCfg.floatBg} max-w-[200px]`}
            aria-label="View active order"
          >
            <div className={`flex items-center gap-1.5 ${activeCfg.floatText}`}>
              {activeCfg.icon}
              <span className="text-xs font-semibold whitespace-nowrap">
                Active Order
              </span>
            </div>
            <div className="w-px h-4 bg-black/20" />
            <span className={`text-xs font-medium ${activeCfg.floatText}`}>
              Tap to add more items
            </span>
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
                         bg-zinc-900 border-t border-zinc-700 rounded-t-3xl
                         max-h-[85vh] overflow-hidden shadow-2xl shadow-black/50"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-12 h-1.5 rounded-full bg-zinc-600" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4
                              border-b border-zinc-700 bg-zinc-800 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                    <ClipboardList size={20} className="text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-lg">My Orders</h2>
                    <p className="text-zinc-400 text-xs">Recent order history</p>
                  </div>
                  {activeOrder && <StatusBadge status={activeOrder.status} />}
                </div>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-white
                             hover:bg-zinc-700 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body — Orders and Recommendations */}
              <div className="flex-1 overflow-y-auto bg-zinc-900">
                {orders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 text-center px-5">
                    <PackageX size={36} className="text-zinc-600 mb-3" />
                    <p className="text-zinc-300 text-sm font-medium">No orders yet.</p>
                    <p className="text-zinc-500 text-xs mt-1 max-w-[200px] leading-relaxed">
                      Place an order and it will appear here.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Orders Section */}
                    <div className="px-5 py-5 space-y-4">
                      {/* Active Order Section */}
                      {activeOrder && (
                        <div className="mb-6">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            <p className="text-xs font-bold text-green-400 uppercase tracking-widest">
                              Active Order
                            </p>
                            <div className="flex-1 h-px bg-green-400/30" />
                          </div>
                          <TrackerOrderCard
                            order={activeOrder}
                            onAddMore={onAddMore}
                            dimmed={false}
                            isActive={true}
                            items={items}
                          />
                        </div>
                      )}

                      {/* Order History with Date Headers */}
                      {groupedHistory.length > 0 && (
                        <div className="space-y-6">
                          {groupedHistory.map((dateGroup, idx) => (
                            <div key={dateGroup.date}>
                              {/* Date-Time Header - Clean without "Add all" */}
                              <div className="flex items-center gap-3 mb-4">
                                <div className="w-2 h-2 rounded-full bg-zinc-500" />
                                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                                  {dateGroup.date} - {dateGroup.time}
                                </p>
                                <div className="flex-1 h-px bg-zinc-700" />
                              </div>
                              
                              {/* Direct Item Rows - No order containers */}
                              <div className="bg-zinc-800 rounded-2xl border border-zinc-700 overflow-hidden">
                                <div className="p-4">
                                  {dateGroup.orders.map(order => 
                                    order.items?.map((item, itemIdx) => (
                                      <OrderHistoryItemRow
                                        key={`${order.id}-${itemIdx}`}
                                        item={item}
                                        onQuickAdd={onQuickAdd}
                                        items={items}
                                      />
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
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
