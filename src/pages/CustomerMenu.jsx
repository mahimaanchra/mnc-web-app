import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  collection, onSnapshot, addDoc, serverTimestamp,
  doc, updateDoc, arrayUnion, increment,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useLocation, Link } from "react-router-dom";
import {
   ShoppingCart, Plus, Minus, X, UtensilsCrossed,
  PackageX, ArrowLeft, CheckCircle2, ChevronRight,
  Phone, Loader2, TableProperties, Gift,
  ClipboardList, PlusCircle, ShoppingBag,
} from "lucide-react";
import { useLoyalty, STREAK_TARGET } from "../hooks/useLoyalty";
import OrderTracker from "../components/OrderTracker";
import OrderModificationSheet from "../components/OrderModificationSheet";
import SessionManager from "../utils/sessionManager";

// ─── Session Management Helpers ────────────────────────────────────────────

// ─── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_EMOJI = {
  "Cold Coffee":"🧋","Mocktails":"🍹","Ice Tea":"🧊",
  "Shakes":"🥤","Hot Beverages":"☕","Burger":"🍔",
  "Sandwiches":"🥪","Vada Pav":"🫓","Pizza":"🍕",
  "Fries":"🍟","Chinese":"🥡","Maggi":"🍜",
  "Pasta":"🍝","Bread":"🍞","Wrap":"🌯",
  "Dessert":"🍨","Combos":"🎁",
};

// The reward item injected into the cart on the 7th order
const FREE_BURGER_KEY   = "__streak_free_burger__";
const FREE_BURGER_ENTRY = {
  itemId:       "streak_reward",
  itemName:     "MNC Special Burger",
  variantLabel: "Regular",
  price:        0,
  addons:       [],
  qty:          1,
  isFreeStreak: true,
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getOrderedCategories(items) {
  const seen = new Set();
  return items.reduce((acc, item) => {
    if (!seen.has(item.category)) { seen.add(item.category); acc.push(item.category); }
    return acc;
  }, []);
}

function cartKey(itemId, variantLabel) { return `${itemId}__${variantLabel}`; }
function cartTotal(cart) {
  return Object.values(cart).reduce((s, e) => s + e.price * e.qty, 0);
}
function cartCount(cart) {
  return Object.values(cart).reduce((s, e) => s + e.qty, 0);
}

// ─── Add-to-Current vs New Order Modal ────────────────────────────────────────
// Shown when the customer taps "Proceed to Checkout" while a Pending/Preparing
// order already exists. They choose whether to append cart items to that order
// or start a completely new order.

function AddOrNewModal({ activeOrder, cart, onAddToCurrent, onNewOrder, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const cartEntries  = Object.values(cart).filter((e) => !e.isFreeStreak);
  const cartTotal    = cartEntries.reduce((s, e) => s + e.price * e.qty, 0);
  const itemCount    = cartEntries.reduce((s, e) => s + e.qty, 0);

  const handleAddToCurrent = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const modItems = cartEntries.map((e) => ({
        itemId:       e.itemId,
        itemName:     e.itemName,
        variantLabel: e.variantLabel,
        price:        e.price,
        qty:          e.qty,
      }));

      await updateDoc(doc(db, "orders", activeOrder.id), {
        modifications:   arrayUnion({
          items:      modItems,
          addedPrice: cartTotal,
          addedAt:    new Date().toISOString(),
          note:       null,
        }),
        totalPrice:      increment(cartTotal),
        hasModification: true,
        lastModifiedAt:  serverTimestamp(),
      });

      onAddToCurrent();           // clears cart + closes checkout
    } catch (err) {
      console.error("Add-to-current failed:", err);
      setError("Could not add items. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="aon-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={!loading ? onClose : undefined}
        className="fixed inset-0 bg-black/75 z-[60] backdrop-blur-sm"
      />

      {/* Card */}
      <motion.div
        key="aon-card"
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={   { opacity: 0, scale: 0.94, y: 20 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        className="fixed inset-0 z-[61] flex items-end sm:items-center justify-center p-4 pointer-events-none"
      >
        <div className="bg-[#1e1e1e] border border-[#2e2e2e] rounded-2xl w-full max-w-sm
                        shadow-2xl pointer-events-auto overflow-hidden">

          {/* Top amber strip */}
          <div className="h-1 w-full bg-gradient-to-r from-[#f5a623] via-amber-300 to-[#f5a623]" />

          <div className="px-5 pt-5 pb-6 space-y-4">
            {/* Heading */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-white font-bold text-base leading-tight">
                  You have an active order
                </h2>
                <p className="text-[#9a9a9a] text-xs mt-1 leading-relaxed">
                  {order_summary(activeOrder)}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="p-1.5 rounded-lg text-[#9a9a9a] hover:text-white hover:bg-[#2e2e2e]
                           transition-colors flex-shrink-0 disabled:opacity-40"
              >
                <X size={17} />
              </button>
            </div>

            {/* Cart summary pill */}
            <div className="flex items-center gap-2.5 bg-[#242424] border border-[#2e2e2e]
                            rounded-xl px-3.5 py-2.5">
              <ShoppingBag size={15} className="text-[#f5a623] flex-shrink-0" />
              <p className="text-white text-xs flex-1 min-w-0">
                <span className="font-bold">{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
                <span className="text-[#9a9a9a]"> in your cart</span>
                <span className="text-[#f5a623] font-bold ml-1.5">₹{cartTotal}</span>
              </p>
            </div>

            {error && (
              <p className="text-red-400 text-xs">{error}</p>
            )}

            {/* Choice buttons */}
            <button
              type="button"
              onClick={handleAddToCurrent}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2
                         bg-[#f5a623] hover:bg-[#e08a00]
                         disabled:opacity-50 disabled:cursor-not-allowed
                         text-[#1a1a1a] font-bold py-3.5 rounded-2xl text-sm
                         transition-colors shadow-lg shadow-[#f5a623]/20 active:scale-[0.98]"
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> Adding to order…</>
                : <><PlusCircle size={15} /> Add to Current Order</>}
            </button>

            <button
              type="button"
              onClick={onNewOrder}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2
                         border border-[#3a3a3a] hover:border-[#f5a623]/40
                         text-[#9a9a9a] hover:text-white
                         disabled:opacity-50 font-semibold py-3 rounded-2xl text-sm
                         transition-colors active:scale-[0.98]"
            >
              <ShoppingCart size={15} /> Place as New Order
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

// Helper — short human-readable summary of the active order for the modal subtitle
function order_summary(order) {
  const table = order.orderMode === "takeaway"
    ? "Takeaway"
    : `Table ${order.tableNumber ?? "—"}`;
  const status = order.status;
  const total  = order.totalPrice ?? 0;
  return `${table} · ${status} · ₹${total}`;
}

// ─── Phone Gate Modal ─────────────────────────────────────────────────────────
// Non-dismissible overlay shown on first visit (or if verifiedPhone is cleared).
// Validates a 10-digit mobile number, persists it to localStorage, and calls
// onVerified(phone) so the parent can immediately sync streak + order data.

function PhoneGateModal({ onVerified }) {
  const [phone,   setPhone]   = useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const cleaned = phone.replace(/[^0-9]/g, "");
    if (cleaned.length !== 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    setLoading(true);
    // Persist immediately so every downstream read from localStorage is warm
    localStorage.setItem("verifiedPhone", cleaned);
    await onVerified(cleaned);
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    // Full-screen dark backdrop — pointer-events-all so nothing behind is tappable
    <div className="fixed inset-0 z-[100] flex items-center justify-center
                    bg-black/85 backdrop-blur-sm px-5">
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 24 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        transition={{ type: "spring", damping: 26, stiffness: 300 }}
        className="w-full max-w-sm bg-[#1e1e1e] border border-[#2e2e2e]
                   rounded-3xl overflow-hidden shadow-2xl"
      >
        {/* Top amber accent strip */}
        <div className="h-1 w-full bg-gradient-to-r from-[#f5a623] via-amber-300 to-[#f5a623]" />

        <div className="px-6 pt-7 pb-8 space-y-5">
          {/* Icon + heading */}
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-[#f5a623]/15 border border-[#f5a623]/30
                            flex items-center justify-center">
              <Phone size={26} className="text-[#f5a623]" />
            </div>
            <div>
              <h2 className="text-white font-bold text-xl leading-tight">
                Welcome to MNC ☕
              </h2>
              <p className="text-[#9a9a9a] text-sm mt-1.5 leading-relaxed">
                Enter your mobile number to track orders,
                earn loyalty rewards, and get your{" "}
                <span className="text-[#f5a623] font-semibold">FREE Burger 🍔</span>{" "}
                on every 7th order.
              </p>
            </div>
          </div>

          {/* Input */}
          <div>
            <label className="block text-xs font-semibold text-[#9a9a9a] mb-2 uppercase tracking-wide">
              10-Digit Mobile Number
            </label>
            <div className="relative">
              <Phone
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2
                           text-[#9a9a9a] pointer-events-none"
              />
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setError(""); }}
                onKeyDown={handleKeyDown}
                placeholder="9876543210"
                autoFocus
                className="w-full bg-[#1a1a1a] border border-[#3a3a3a] text-white text-base
                           placeholder-[#555] rounded-2xl pl-10 pr-4 py-3
                           focus:outline-none focus:border-[#f5a623] transition-colors"
              />
            </div>
            {error && (
              <p className="text-red-400 text-xs mt-2 flex items-center gap-1.5">
                <span className="inline-block w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />
                {error}
              </p>
            )}
          </div>

          {/* Loyalty nudge */}
          <div className="flex items-start gap-3 bg-[#f5a623]/8 border border-[#f5a623]/20
                          rounded-2xl px-4 py-3">
            <Gift size={16} className="text-[#f5a623] mt-0.5 flex-shrink-0" />
            <p className="text-[#f5a623]/80 text-xs leading-relaxed">
              Your streak is tied to this number. Order {STREAK_TARGET} times
              and your next order includes a{" "}
              <strong className="text-[#f5a623]">free MNC Special Burger</strong>!
            </p>
          </div>

          {/* CTA */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || phone.replace(/[^0-9]/g, "").length < 10}
            className="w-full flex items-center justify-center gap-2
                       bg-[#f5a623] hover:bg-[#e08a00]
                       disabled:opacity-40 disabled:cursor-not-allowed
                       text-[#1a1a1a] font-bold py-3.5 rounded-2xl text-sm
                       transition-colors shadow-lg shadow-[#f5a623]/25
                       active:scale-[0.98] min-h-[52px]"
          >
            {loading
              ? <><Loader2 size={16} className="animate-spin" /> Setting up your account…</>
              : <><CheckCircle2 size={16} /> Start Ordering</>}
          </button>

          <p className="text-[#555] text-[11px] text-center leading-relaxed">
            Your number is only used for order tracking and loyalty rewards.
            We never share it.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Streak Banner ─────────────────────────────────────────────────────────────

function StreakBanner({ completedOrders }) {
  const filled   = completedOrders % STREAK_TARGET;   // 0-6
  const isEarned = completedOrders > 0 && completedOrders % STREAK_TARGET === 0;
  const display  = isEarned ? STREAK_TARGET : filled; // dots to highlight

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 mt-3 mb-1 rounded-2xl border border-amber-500/30
                 overflow-hidden"
      style={{ background: "rgba(245,158,11,0.06)" }}
    >
      <div className="px-4 py-3">
        {/* Heading row */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Gift size={14} className="text-amber-400 flex-shrink-0" />
            <span className="text-amber-300 text-xs font-bold tracking-wide">
              Loyalty Streak
            </span>
          </div>
          <span className="text-amber-500/60 text-[10px] font-semibold">
            {display}/{STREAK_TARGET}
          </span>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mb-2.5">
          {Array.from({ length: STREAK_TARGET }, (_, i) => {
            const active = i < display;
            return (
              <div
                key={i}
                className={`flex-1 h-2 rounded-full transition-all duration-300
                            ${active
                              ? "bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)]"
                              : "bg-[#2a2a2a]"}`}
              />
            );
          })}
          {/* Burger icon at end */}
          <span className="text-base leading-none ml-1">🍔</span>
        </div>

        {/* Dynamic message */}
        {isEarned ? (
          <p className="text-amber-300 text-xs font-bold leading-snug">
            🎉 7TH ORDER UNLOCKED! Your MNC Special Burger is{" "}
            <span className="text-green-400">FREE</span> in your cart! 🍔
          </p>
        ) : display === 0 ? (
          <p className="text-amber-500/70 text-xs leading-snug">
            🔥 Order {STREAK_TARGET} times to earn a <strong className="text-amber-400">FREE Burger!</strong>
          </p>
        ) : (
          <p className="text-amber-500/70 text-xs leading-snug">
            🔥 <strong className="text-amber-400">{STREAK_TARGET - display} more order{STREAK_TARGET - display !== 1 ? "s" : ""}</strong> to go for your FREE Burger! 🍔
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ─── ItemCard ──────────────────────────────────────────────────────────────────

function ItemCard({ item, onAddToCart }) {
  const [selectedVariant, setSelectedVariant] = useState(item.variants?.[0] ?? null);
  const [selectedAddons,  setSelectedAddons]  = useState([]);
  const [imgErr,          setImgErr]          = useState(false);

  useEffect(() => {
    setSelectedVariant(item.variants?.[0] ?? null);
    setSelectedAddons([]);
  }, [item.id, item.variants]);

  const toggleAddon = (addon) =>
    setSelectedAddons((prev) =>
      prev.some((a) => a.label === addon.label)
        ? prev.filter((a) => a.label !== addon.label)
        : [...prev, addon]
    );

  const addonTotal = selectedAddons.reduce((s, a) => s + a.price, 0);
  const linePrice  = (selectedVariant?.price ?? 0) + addonTotal;

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      className={`bg-[#242424] border rounded-2xl overflow-hidden flex flex-col
                  ${item.inStock ? "border-[#2e2e2e]" : "border-[#2e2e2e] opacity-60"}`}
    >
      <div className="relative h-44 bg-[#1e1e1e] overflow-hidden flex-shrink-0 ">
        {item.imageUrl && !imgErr
          ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover"
              onError={() => setImgErr(true)} />
          : <div className="absolute inset-0 flex items-center justify-center">
              <UtensilsCrossed size={36} className="text-[#3a3a3a]" /></div>
        }
        <span className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-[#f5a623]
                         text-xs font-semibold px-2.5 py-1 rounded-full border border-[#f5a623]/20">
         {item.category}
        </span>
        {!item.inStock && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-full">
              OUT OF STOCK
            </span>
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-semibold text-white text-base leading-tight">{item.name}</h3>
        {item.description && (
          <p className="text-[#9a9a9a] text-xs mt-1 leading-relaxed line-clamp-2">{item.description}</p>
        )}

        {item.variants?.length > 0 && (
          <div className="mt-3">
            <p className="text-[#9a9a9a] text-xs mb-1.5">Size / Type</p>
            <div className="flex flex-wrap gap-1.5">
              {item.variants.map((v) => (
                <button key={v.label} type="button" disabled={!item.inStock}
                  onClick={() => setSelectedVariant(v)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors
                              ${selectedVariant?.label === v.label
                                ? "bg-[#f5a623] text-[#1a1a1a] border-[#f5a623]"
                                : "bg-[#1a1a1a] text-[#9a9a9a] border-[#3a3a3a] hover:border-[#f5a623]/50"}`}>
                  {v.label}<span className="ml-1 opacity-75">₹{v.price}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {item.addons?.length > 0 && (
          <div className="mt-3">
            <p className="text-[#9a9a9a] text-xs mb-1.5">Add-ons</p>
            <div className="flex flex-wrap gap-1.5">
              {item.addons.map((a) => {
                const active = selectedAddons.some((s) => s.label === a.label);
                return (
                  <button key={a.label} type="button" disabled={!item.inStock}
                    onClick={() => toggleAddon(a)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors
                                ${active
                                  ? "bg-[#f5a623]/20 text-[#f5a623] border-[#f5a623]/50"
                                  : "bg-[#1a1a1a] text-[#9a9a9a] border-[#3a3a3a] hover:border-[#f5a623]/30"}`}>
                    +{a.label}<span className="ml-1 opacity-75">₹{a.price}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-auto pt-4 flex items-center justify-between">
          <div>
            <span className="text-[#f5a623] font-bold text-lg">₹{linePrice}</span>
            {addonTotal > 0 && (
              <span className="text-[#9a9a9a] text-xs ml-1">
                (base ₹{selectedVariant?.price ?? 0} + ₹{addonTotal})
              </span>
            )}
          </div>
          <button type="button"
            disabled={!item.inStock || !selectedVariant}
            onClick={() => {
              if (!selectedVariant) return;
              onAddToCart({
                itemId: item.id, itemName: item.name,
                variantLabel: selectedVariant.label, price: linePrice, addons: selectedAddons,
              });
            }}
            className="flex items-center gap-1.5 bg-[#f5a623] hover:bg-[#e08a00]
                       disabled:opacity-40 disabled:cursor-not-allowed
                       text-[#1a1a1a] font-bold text-sm px-4 py-2.5 rounded-xl
                       transition-colors shadow shadow-[#f5a623]/20
                       min-h-[44px] active:scale-95">
            <Plus size={15} />Add
          </button>
        </div>
      </div>
    </motion.div>
  );
}
// ─── Checkout Modal ────────────────────────────────────────────────────────────
function CheckoutModal({
  cart, tableNumber, onUpdateQty, onClose, onOrderPlaced,
  completedOrders, fetchProfile, recordOrder,
  prefilledPhone,   // already verified via PhoneGateModal — skips the phone step
}) {
  // Get session state safely from SessionManager or localStorage
  const sessionState = SessionManager.getSession ? SessionManager.getSession() : {
    orderMode: localStorage.getItem("orderMode"),
    tableNumber: localStorage.getItem("tableNo"),
    verifiedPhone: localStorage.getItem("verifiedPhone")
  };

  // Determine the saved order mode from localStorage with session awareness
  const { orderMode: savedMode } = sessionState;

  // Step flow:
  //   "mode"  → ask Dine-In or Takeaway (skip if orderMode already saved, OR if special filter is active)
  //   "table" → ask table number (dine-in only, skip if tableNumber already known OR if special filter)
  //   "confirm" → final confirmation
  //   "success" → done
  const deriveInitialStep = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const isSpecialFilter = urlParams.get("filter") === "special";
    
    // Special categories bypass table selection entirely
    if (isSpecialFilter) return "confirm";
    
    // If no dining mode is saved, we need to ask at checkout
    if (!savedMode) return "mode";
    
    // If takeaway mode, go straight to confirm
    if (savedMode === "takeaway") return "confirm";
    
    // If dine-in mode but no table number, ask for table
    if (savedMode === "dine-in" && !tableNumber) return "table";
    
    // Otherwise go to confirm
    return "confirm";
  };

  const [step,          setStep]          = useState(deriveInitialStep);
  const [orderMode,     setOrderMode]     = useState(savedMode || "");  // "dine-in" | "takeaway"
  const [localTable,    setLocalTable]    = useState(tableNumber || "");
  const [phone,         setPhone]         = useState("");
  const [phoneLoading,  setPhoneLoading]  = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [phoneError,    setPhoneError]    = useState("");
  // Pre-fill verifiedPhone from the gate so checkout doesn't ask again
  const [verifiedPhone, setVerifiedPhone] = useState(prefilledPhone ?? "");
  const [localCount,    setLocalCount]    = useState(completedOrders);

  const handleModeSelect = (mode) => {
    setOrderMode(mode);
    SessionManager.setOrderMode(mode);
    
    if (mode === "takeaway") {
      // Takeaway: clear any existing table number and go to confirm
      SessionManager.setTableNumber(null);
      setLocalTable("");
      setStep("confirm");
    } else {
      // Dine-in: check if we have a table number
      const existingTable = tableNumber || sessionState.tableNumber;
      if (existingTable) {
        setLocalTable(existingTable);
        setStep("confirm");
      } else {
        // Need to get table number first
        setStep("table");
      }
    }
  };

  const isThisOrderReward = localCount + 1 === STREAK_TARGET;

  const effectiveCart = isThisOrderReward
    ? { ...cart, [FREE_BURGER_KEY]: { ...FREE_BURGER_ENTRY } }
    : cart;

  const entries = Object.entries(effectiveCart);
  const total   = cartTotal(effectiveCart);

  const handlePhoneSubmit = async () => {
    setPhoneError("");
    const cleaned = phone.replace(/[^0-9]/g, "");
    if (cleaned.length !== 10) {
      setPhoneError("Enter a valid 10-digit mobile number");
      return;
    }
    setPhoneLoading(true);
    try {
      setVerifiedPhone(cleaned);
      const count = await fetchProfile(cleaned);
      setLocalCount(count);
      setStep("confirm");
    } catch (err) {
      console.error("Profile load failed:", err);
      setPhoneError("Something went wrong. Please try again.");
    } finally {
      setPhoneLoading(false);
    }
  };

  const handlePlaceOrder = async () => {
    setSubmitting(true);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const isSpecialFilter = urlParams.get("filter") === "special";
      
      // For special orders, default to takeaway unless explicitly dine-in
      const finalOrderMode = isSpecialFilter ? "takeaway" : (orderMode || "dine-in");
      const finalTableNumber = isSpecialFilter ? "Takeaway" : 
                               (finalOrderMode === "takeaway" ? "Takeaway" : (localTable || "—"));

      const orderItems = entries.map(([, e]) => ({
        itemId:       e.itemId,
        itemName:     e.itemName,
        variantLabel: e.variantLabel,
        price:        e.price,
        qty:          e.qty,
        addons:       e.addons ?? [],
        isFreeStreak: e.isFreeStreak ?? false,
      }));

      await addDoc(collection(db, "orders"), {
        tableNumber:      finalTableNumber,
        orderMode:        finalOrderMode,
        items:            orderItems,
        totalPrice:       total,
        status:           "Pending",
        paymentMethod:    "Pay at Counter",
        customerPhone:    verifiedPhone || null,
        isStreakOrder:    isThisOrderReward,
        isSpecialOrder:   isSpecialFilter,
        createdAt:        serverTimestamp(),
      });

      if (verifiedPhone) {
        localStorage.setItem("verifiedPhone", verifiedPhone);
        await recordOrder(verifiedPhone);
      }

      // Only save mode/table if not a special order
      if (!isSpecialFilter) {
        if (finalOrderMode === "dine-in" && localTable) {
          localStorage.setItem("tableNumber", localTable);
        } else if (finalOrderMode === "takeaway") {
          // Takeaway: wipe any stale table so next dine-in starts fresh
          localStorage.removeItem("tableNumber");
        }
        localStorage.setItem("orderMode", finalOrderMode);
      }

      setStep("success");
      setTimeout(() => { onOrderPlaced(); }, 1800);
    } catch (err) {
      console.error("Order failed:", err);
      setPhoneError("Order could not be placed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipPhone = () => {
    setVerifiedPhone("");
    setStep("confirm");
  };

  return (
    <>
      <motion.div key="checkout-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={step !== "success" ? onClose : undefined}
        className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm" />

      <motion.div key="checkout-modal"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={   { opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 pointer-events-none">

        <div className="bg-[#1e1e1e] border border-[#2e2e2e] rounded-2xl w-full max-w-md
                        shadow-2xl pointer-events-auto overflow-hidden">

          {/* ── STEP: Dine-In or Takeaway ── */}
          {step === "mode" && (
            <>
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#2e2e2e]">
                <h2 className="text-white font-bold text-sm">Choose your dining option</h2>
                <button onClick={onClose}
                  className="p-1.5 rounded-lg text-[#9a9a9a] hover:text-white hover:bg-[#2e2e2e] transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="px-5 py-6 space-y-4">
                <p className="text-[#9a9a9a] text-sm text-center">
                  How would you like to enjoy your order?
                </p>
                
                <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleModeSelect("dine-in")}
                  className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2
                             border-[#3a3a3a] hover:border-[#f5a623] bg-[#242424]
                             hover:bg-[#f5a623]/10 transition-all active:scale-95"
                >
                  <span className="text-3xl">🪑</span>
                  <div className="text-center">
                    <p className="text-white font-bold text-sm">Dine-In</p>
                    <p className="text-[#9a9a9a] text-xs mt-0.5">Sit at a table</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleModeSelect("takeaway")}
                  className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2
                             border-[#3a3a3a] hover:border-[#f5a623] bg-[#242424]
                             hover:bg-[#f5a623]/10 transition-all active:scale-95"
                >
                  <span className="text-3xl">🛍️</span>
                  <div className="text-center">
                    <p className="text-white font-bold text-sm">Takeaway</p>
                    <p className="text-[#9a9a9a] text-xs mt-0.5">Pick up &amp; go</p>
                  </div>
                </button>
                </div>
              </div>
            </>
          )}

          {/* ── STEP: Table Number Entry (dine-in only) ── */}
          {step === "table" && (
            <>
              <div className="flex items-center gap-2 px-5 py-4 border-b border-[#2e2e2e]">
                <button onClick={() => setStep("mode")}
                  className="p-1.5 rounded-lg text-[#9a9a9a] hover:text-white hover:bg-[#2e2e2e] transition-colors">
                  <ArrowLeft size={16} />
                </button>
                <h2 className="text-white font-bold flex items-center gap-2 flex-1">
                  <TableProperties size={16} className="text-[#f5a623]" /> Choose Your Table
                </h2>
                <button onClick={onClose}
                  className="p-1.5 rounded-lg text-[#9a9a9a] hover:text-white hover:bg-[#2e2e2e] transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="px-5 py-6 space-y-4">
                <div className="text-center mb-4">
                  <p className="text-[#f5a623] text-sm font-semibold">🪑 Dine-In Selected</p>
                  <p className="text-[#9a9a9a] text-xs mt-1">Please enter your table number to complete your order</p>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-xs font-medium text-[#9a9a9a]">
                      Select Your Table Number
                    </label>
                    <span className="text-xs text-green-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                      All tables available
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    {Array.from({ length: 10 }, (_, i) => {
                      const tableNum = (i + 1).toString();
                      const isSelected = localTable === tableNum;
                      return (
                        <motion.button
                          key={tableNum}
                          type="button"
                          onClick={() => setLocalTable(tableNum)}
                          whileTap={{ scale: 0.9 }}
                          whileHover={{ scale: 1.05 }}
                          className={`aspect-square rounded-xl border-2 transition-all duration-200 
                                     flex items-center justify-center text-sm font-bold
                                     relative overflow-hidden
                                     ${isSelected 
                                       ? 'bg-[#f5a623] border-[#f5a623] text-[#1a1a1a] shadow-lg shadow-[#f5a623]/30' 
                                       : 'bg-[#2a2a2a] border-[#3a3a3a] text-[#9a9a9a] hover:border-[#f5a623]/50 hover:text-white'
                                     }`}
                        >
                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute inset-0 bg-[#f5a623]/20 rounded-xl"
                            />
                          )}
                          <span className="relative z-10">{tableNum}</span>
                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className="absolute top-1 right-1 w-2 h-2 bg-[#1a1a1a] rounded-full"
                            />
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                  
                  {/* Custom table number input as fallback */}
                  <details className="group">
                    <summary className="text-xs text-[#9a9a9a] cursor-pointer hover:text-white transition-colors mb-2 list-none">
                      <span className="flex items-center gap-1">
                        Don't see your table? Enter custom number
                        <svg 
                          className="w-3 h-3 transition-transform group-open:rotate-180" 
                          fill="none" 
                          viewBox="0 0 24 24" 
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </span>
                    </summary>
                    <input 
                      type="text" 
                      value={localTable && !['1','2','3','4','5','6','7','8','9','10'].includes(localTable) ? localTable : ''}
                      onChange={(e) => setLocalTable(e.target.value)}
                      placeholder="Enter table number"
                      className="w-full bg-[#1a1a1a] border border-[#3a3a3a] text-white
                                 placeholder-[#555] rounded-xl px-4 py-2.5 text-sm
                                 focus:outline-none focus:border-[#f5a623] transition-colors" 
                    />
                  </details>
                </div>

                <button onClick={() => {
                    if (localTable.trim()) {
                      SessionManager.setTableNumber(localTable.trim());
                      setStep("confirm");
                    }
                  }} disabled={!localTable.trim()}
                  className="w-full flex items-center justify-center gap-2
                             bg-[#f5a623] hover:bg-[#e08a00] disabled:opacity-50
                             text-[#1a1a1a] font-bold py-3 rounded-xl text-sm transition-colors
                             min-h-[48px]">
                  {localTable.trim() 
                    ? <>Confirm Table {localTable} <ChevronRight size={15} /></>
                    : <>Select a Table <ChevronRight size={15} /></>
                  }
                </button>
              </div>
            </>
          )}

          {/* ── STEP: phone entry ── */}
          {step === "phone" && (
            <>
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#2e2e2e]">
                <button onClick={() => setStep("cart")}
                  className="p-1.5 rounded-lg text-[#9a9a9a] hover:text-white hover:bg-[#2e2e2e] transition-colors">
                  <ArrowLeft size={18} />
                </button>
                <h2 className="text-white font-bold flex items-center gap-2">
                  <Phone size={16} className="text-[#f5a623]" /> Enter Mobile Number
                </h2>
                <button onClick={onClose}
                  className="p-1.5 rounded-lg text-[#9a9a9a] hover:text-white hover:bg-[#2e2e2e] transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="px-5 py-6 space-y-4">
                <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20
                                rounded-xl px-3.5 py-3">
                  <Gift size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-amber-300/80 text-xs leading-relaxed">
                    Enter your phone number to track your{" "}
                    <strong className="text-amber-400">loyalty streak</strong>.
                    Every 7th order earns you a <strong className="text-amber-400">FREE Burger! 🍔</strong>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#9a9a9a] mb-1.5">
                    10-Digit Mobile Number
                  </label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2
                                                text-[#9a9a9a] pointer-events-none" />
                    <input type="tel" value={phone}
                      onChange={(e) => { setPhone(e.target.value); setPhoneError(""); }}
                      placeholder="9876543210"
                      maxLength={10}
                      className="w-full bg-[#1a1a1a] border border-[#3a3a3a] text-white
                                 placeholder-[#555] rounded-xl pl-9 pr-4 py-2.5 text-sm
                                 focus:outline-none focus:border-[#f5a623] transition-colors" />
                  </div>
                  {phoneError && <p className="text-red-400 text-xs mt-1.5">{phoneError}</p>}
                </div>

                <button onClick={handlePhoneSubmit} disabled={phoneLoading || !phone.trim()}
                  className="w-full flex items-center justify-center gap-2
                             bg-[#f5a623] hover:bg-[#e08a00] disabled:opacity-50
                             text-[#1a1a1a] font-bold py-3 rounded-xl text-sm transition-colors">
                  {phoneLoading
                    ? <><Loader2 size={15} className="animate-spin" /> Verifying…</>
                    : <>Continue <ChevronRight size={15} /></>}
                </button>

                <button onClick={handleSkipPhone}
                  className="w-full text-center text-[#9a9a9a] hover:text-white
                             text-xs underline underline-offset-2 transition-colors">
                  Skip — place order without loyalty tracking
                </button>
              </div>
            </>
          )}

          {/* ── STEP: final confirmation ── */}
          {step === "confirm" && (
            <>
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#2e2e2e]">
                <button onClick={() => {
                    const urlParams = new URLSearchParams(window.location.search);
                    const isSpecialFilter = urlParams.get("filter") === "special";
                    
                    if (isSpecialFilter) {
                      // Special orders can go back to main menu
                      window.history.back();
                      return;
                    }
                    
                    // Regular flow: go back based on current state
                    if (orderMode === "takeaway" || !orderMode) {
                      setStep("mode");
                    } else if (orderMode === "dine-in") {
                      // If dine-in, go back to table selection or mode selection
                      setStep(localTable ? "table" : "mode");
                    } else {
                      setStep("mode");
                    }
                  }}
                  className="p-1.5 rounded-lg text-[#9a9a9a] hover:text-white hover:bg-[#2e2e2e] transition-colors">
                  <ArrowLeft size={18} />
                </button>
                <h2 className="text-white font-bold flex items-center gap-2">
                  <TableProperties size={16} className="text-[#f5a623]" /> Confirm Order
                </h2>
                <button onClick={onClose}
                  className="p-1.5 rounded-lg text-[#9a9a9a] hover:text-white hover:bg-[#2e2e2e] transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="px-5 py-5 space-y-4">
                {(() => {
                  const urlParams = new URLSearchParams(window.location.search);
                  const isSpecialFilter = urlParams.get("filter") === "special";
                  
                  if (isSpecialFilter) {
                    return (
                      <div className="flex items-center gap-3 bg-amber-500/12 border border-amber-400/40
                                   rounded-xl px-4 py-3">
                        <span className="text-2xl flex-shrink-0">⭐</span>
                        <div>
                          <p className="text-amber-300 font-bold text-sm leading-tight">
                            MNC Special Order
                          </p>
                          <p className="text-amber-500/70 text-xs mt-0.5">
                            Your special order will be prepared for takeaway
                          </p>
                        </div>
                      </div>
                    );
                  }
                  
                  if (isThisOrderReward) {
                    return (
                      <div className="flex items-center gap-3 bg-amber-500/12 border border-amber-400/40
                                   rounded-xl px-4 py-3">
                        <span className="text-2xl flex-shrink-0">🎉</span>
                        <div>
                          <p className="text-amber-300 font-bold text-sm leading-tight">
                            7th Order Unlocked!
                          </p>
                          <p className="text-amber-500/70 text-xs mt-0.5">
                            MNC Special Burger added to your order for FREE!
                          </p>
                        </div>
                      </div>
                    );
                  }
                  
                  return null;
                })()}

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#242424] border border-[#2e2e2e] rounded-xl p-3">
                    <p className="text-[#9a9a9a] text-xs mb-0.5">
                      {(() => {
                        const urlParams = new URLSearchParams(window.location.search);
                        const isSpecialFilter = urlParams.get("filter") === "special";
                        
                        if (isSpecialFilter) return "Special Order";
                        return orderMode === "takeaway" ? "Mode" : "Table";
                      })()}
                    </p>
                    <p className="text-white font-bold text-lg">
                      {(() => {
                        const urlParams = new URLSearchParams(window.location.search);
                        const isSpecialFilter = urlParams.get("filter") === "special";
                        
                        if (isSpecialFilter) return "⭐ MNC Special";
                        return orderMode === "takeaway" ? "🛍️ Takeaway" : (localTable || "—");
                      })()}
                    </p>
                  </div>
                  <div className="bg-[#242424] border border-[#2e2e2e] rounded-xl p-3">
                    <p className="text-[#9a9a9a] text-xs mb-0.5">Total</p>
                    <p className="text-[#f5a623] font-bold text-lg">₹{total}</p>
                  </div>
                </div>

                {verifiedPhone && (
                  <div className="flex items-center gap-2 bg-green-900/20 border border-green-800/30
                                  rounded-xl px-3 py-2">
                    <CheckCircle2 size={14} className="text-green-400 flex-shrink-0" />
                    <span className="text-green-400 text-xs font-medium">
                      Number: {verifiedPhone}
                    </span>
                  </div>
                )}

                <div className="bg-[#242424] border border-[#2e2e2e] rounded-xl p-3">
                  <p className="text-[#9a9a9a] text-xs mb-1">Payment Method</p>
                  <p className="text-white text-sm font-semibold">💵 Pay at Counter</p>
                </div>

                <button onClick={handlePlaceOrder} disabled={submitting}
                  className="w-full flex items-center justify-center gap-2
                             bg-[#f5a623] hover:bg-[#e08a00] disabled:opacity-60
                             text-[#1a1a1a] font-bold py-3.5 rounded-xl text-sm transition-colors">
                  {submitting
                    ? <><Loader2 size={15} className="animate-spin" /> Placing Order…</>
                    : <>Place Order <ChevronRight size={16} /></>}
                </button>
              </div>
            </>
          )}

          {/* ── STEP: success ── */}
          {step === "success" && (
            <div className="px-6 py-10 flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-500/40
                           flex items-center justify-center mb-5">
                <CheckCircle2 size={40} className="text-green-400" />
              </div>
              <h2 className="text-white font-bold text-xl mb-2">
                {isThisOrderReward ? "🎉 Free Burger Claimed!" : "Order Placed! 🎉"}
              </h2>
              <p className="text-[#9a9a9a] text-sm leading-relaxed max-w-xs">
                Your order is being prepared. Please pay at the counter when ready.
              </p>
              <div className="mt-4 bg-[#242424] border border-[#2e2e2e] rounded-xl px-5 py-3">
                {(() => {
                  const urlParams = new URLSearchParams(window.location.search);
                  const isSpecialFilter = urlParams.get("filter") === "special";
                  
                  if (isSpecialFilter) {
                    return (
                      <>
                        <p className="text-[#9a9a9a] text-xs">Special Order</p>
                        <p className="text-[#f5a623] font-bold text-2xl">⭐ MNC Special</p>
                      </>
                    );
                  }
                  
                  return orderMode === "takeaway" ? (
                    <>
                      <p className="text-[#9a9a9a] text-xs">Order Type</p>
                      <p className="text-[#f5a623] font-bold text-2xl">🛍️ Takeaway</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[#9a9a9a] text-xs">Table Number</p>
                      <p className="text-[#f5a623] font-bold text-2xl">{localTable}</p>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ─── Cart Drawer ───────────────────────────────────────────────────────────────

function CartDrawer({ cart, onUpdateQty, onClose, onCheckout }) {
  const entries = Object.entries(cart);
  const total   = cartTotal(cart);

  return (
    <motion.div key="cart-drawer"
      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 280 }}
      className="fixed inset-y-0 right-0 w-full sm:w-[380px] bg-[#1e1e1e]
                 border-l border-[#2e2e2e] z-40 flex flex-col shadow-2xl">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#2e2e2e]">
        <h2 className="text-white font-bold text-base flex items-center gap-2">
          <ShoppingCart size={18} className="text-[#f5a623]" /> Your Cart
        </h2>
        <button onClick={onClose}
          className="p-1.5 rounded-lg text-[#9a9a9a] hover:text-white hover:bg-[#2e2e2e] transition-colors">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <ShoppingCart size={40} className="text-[#3a3a3a] mb-3" />
            <p className="text-[#9a9a9a] text-sm">Your cart is empty.</p>
          </div>
        ) : entries.map(([key, entry]) => (
          <div key={key} className="bg-[#242424] border border-[#2e2e2e] rounded-xl p-3
                                    flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{entry.itemName}</p>
              <p className="text-[#9a9a9a] text-xs mt-0.5">{entry.variantLabel}</p>
              {entry.addons?.length > 0 && (
                <p className="text-[#f5a623]/70 text-xs mt-0.5">
                  + {entry.addons.map((a) => a.label).join(", ")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => onUpdateQty(key, -1)}
                className="w-7 h-7 rounded-lg bg-[#1a1a1a] border border-[#3a3a3a]
                           flex items-center justify-center text-[#9a9a9a]
                           hover:text-white hover:border-[#f5a623]/50 transition-colors">
                <Minus size={12} />
              </button>
              <span className="text-white font-semibold text-sm w-5 text-center">{entry.qty}</span>
              <button onClick={() => onUpdateQty(key, +1)}
                className="w-7 h-7 rounded-lg bg-[#1a1a1a] border border-[#3a3a3a]
                           flex items-center justify-center text-[#9a9a9a]
                           hover:text-white hover:border-[#f5a623]/50 transition-colors">
                <Plus size={12} />
              </button>
            </div>
            <span className="text-[#f5a623] font-bold text-sm flex-shrink-0 w-16 text-right">
              ₹{entry.price * entry.qty}
            </span>
          </div>
        ))}
      </div>

      {entries.length > 0 && (
        <div className="px-5 py-4 border-t border-[#2e2e2e] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[#9a9a9a] text-sm">Total</span>
            <span className="text-white font-bold text-xl">₹{total}</span>
          </div>
          <button onClick={onCheckout}
            className="w-full flex items-center justify-center gap-2
                       bg-[#f5a623] hover:bg-[#e08a00] text-[#1a1a1a]
                       font-bold py-3.5 rounded-xl transition-colors
                       shadow-lg shadow-[#f5a623]/20 text-sm">
            Proceed to Checkout <ChevronRight size={16} />
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ─── Main CustomerMenu ─────────────────────────────────────────────────────────

export default function CustomerMenu() {
  const location = useLocation();

  // Initialize session management
  const sessionState = SessionManager.initialize();
  
  const tableNumber = (() => {
    const p = new URLSearchParams(location.search).get("table");
    return p ?? sessionState.tableNumber ?? "";
  })();
  
  useEffect(() => {
    if (tableNumber) SessionManager.setTableNumber(tableNumber);
  }, [tableNumber]);

  const {
    completedOrders,
    fetchProfile,
    recordOrder,
  } = useLoyalty();

  // ── Single source of truth for the verified phone ──────────────────────────
  // Initialised from localStorage so returning customers skip the gate immediately.
  // Updated by PhoneGateModal.onVerified and by CheckoutModal when it saves a phone.
  const [verifiedPhone, setVerifiedPhone] = useState(
    () => localStorage.getItem("verifiedPhone") ?? "",
  );

  // Show gate if phone is still empty after mount
  const phoneGateRequired = !verifiedPhone;

  // Listen for session reset events
  useEffect(() => {
    const unsubscribe = SessionManager.onSessionReset((detail) => {
      console.log('🔄 CustomerMenu received session reset:', detail);
      
      // Reset local state that depends on session
      setCart({});
      setCartOpen(false);
      setCheckoutOpen(false);
      setModifyingOrder(null);
      setTrackerOpen(false);
      setAddOrNewOpen(false);
      
      // Show a brief notification to user
      console.log('✨ Starting fresh session for your next order');
      
      // Optional: Force component refresh for order completion
      if (detail.reason === 'orderCompleted') {
        setTimeout(() => {
          // Soft refresh - just reload the component state
          window.location.reload();
        }, 2000);
      }
    });

    return unsubscribe;
  }, []);

  // Callback handed to PhoneGateModal — phone is already saved to localStorage
  // by the time this fires; we just sync React state and kick off data fetches.
  const handlePhoneVerified = useCallback(async (phone) => {
    setVerifiedPhone(phone);
    await fetchProfile(phone);
  }, [fetchProfile]);

  // Fetch loyalty profile whenever verifiedPhone becomes available
  // (covers both the gate flow and returning visitors)
  useEffect(() => {
    if (verifiedPhone) fetchProfile(verifiedPhone);
  }, [verifiedPhone, fetchProfile]);

  const [items,          setItems]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");
  const [cart,           setCart]           = useState({});
  const [cartOpen,       setCartOpen]       = useState(false);
  const [checkoutOpen,   setCheckoutOpen]   = useState(false);
  const [showOutOfStock, setShowOutOfStock] = useState(true);

  // ── Order tracking & live modification ─────────────────────────────────────
  const [modifyingOrder,  setModifyingOrder]  = useState(null);  // order doc to modify
  const [trackerOpen,     setTrackerOpen]     = useState(false); // My Orders sheet
  const [activeOrder,     setActiveOrder]     = useState(null);  // live active order from tracker
  const [addOrNewOpen,    setAddOrNewOpen]    = useState(false); // interception modal

  const handleActiveOrderChange = useCallback((order) => {
    setActiveOrder(order);
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "menu_items"), (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  const categories    = getOrderedCategories(items);
  const allCategories = ["All", ...categories];

  const queryParam = new URLSearchParams(location.search).get("filter");

  // Fixed filtering logic to cleanly handle both special filters and category tabs
  const visibleItems = items.filter((item) => {
    const matchFilter = queryParam === "special"
      ? (item.special || item.isMncSpecial)
      : (activeCategory === "All" || item.category === activeCategory);

    const matchStock = showOutOfStock || item.inStock;
    return matchFilter && matchStock;
  });

  const groupedItems = activeCategory === "All" && queryParam !== "special"
    ? categories.reduce((acc, cat) => {
        const ci = visibleItems.filter((i) => i.category === cat);
        if (ci.length) acc[cat] = ci;
        return acc;
      }, {})
    : { [activeCategory === "All" && queryParam === "special" ? "Special Offers" : activeCategory]: visibleItems };

  const handleAddToCart = ({ itemId, itemName, variantLabel, price, addons }) => {
    const key = cartKey(itemId, variantLabel);
    setCart((prev) => ({
      ...prev,
      [key]: prev[key]
        ? { ...prev[key], qty: prev[key].qty + 1 }
        : { itemId, itemName, variantLabel, price, addons, qty: 1 },
    }));
  };

  const handleUpdateQty = (key, delta) => {
    setCart((prev) => {
      const entry  = prev[key];
      if (!entry) return prev;
      const newQty = entry.qty + delta;
      if (newQty <= 0) { const { [key]: _, ...rest } = prev; return rest; }
      return { ...prev, [key]: { ...entry, qty: newQty } };
    });
  };

  const count = cartCount(cart);

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex justify-center">
      {/* Mobile-first container with shadow on larger screens */}
      <div className="w-full max-w-md mx-auto bg-[#1a1a1a] shadow-2xl min-h-screen relative">
        {/* Shadow overlay for desktop */}
        <div className="hidden md:block absolute inset-0 -z-10 bg-gradient-to-r from-black/20 via-transparent to-black/20 rounded-2xl" />
        
        <div className="relative z-10">

      {/* ── Phone Gate — blocks all interaction until a phone is provided ── */}
      {phoneGateRequired && (
        <PhoneGateModal onVerified={handlePhoneVerified} />
      )}
      <header className="sticky top-0 z-30 bg-[#1a1a1a]/95 backdrop-blur border-b border-[#2e2e2e]">
        <div className="px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/"
              className="p-2 rounded-lg text-[#9a9a9a] hover:text-white hover:bg-[#2e2e2e] transition-colors">
              <ArrowLeft size={18} />
            </Link>
            <div className="flex items-center gap-2">
              <div>
                <h1 className="text-white font-bold text-base leading-tight">Mid Night Coffee</h1>
                <p className="text-[#9a9a9a] text-xs">
                  {tableNumber ? `Table ${tableNumber}` : "Menu"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* My Orders — only visible after phone is verified */}
            {verifiedPhone && (
              <button
                onClick={() => setTrackerOpen(true)}
                className="relative flex items-center gap-1.5 bg-[#242424] hover:bg-[#2e2e2e]
                           border border-[#2e2e2e] hover:border-[#f5a623]/40
                           text-white text-sm font-semibold px-3 py-2 rounded-xl transition-colors"
              >
                <ClipboardList size={15} className="text-[#f5a623]" />
                <span className="hidden sm:inline text-xs">Orders</span>
              </button>
            )}

            <button onClick={() => setCartOpen(true)}
              className="relative flex items-center gap-2 bg-[#242424] hover:bg-[#2e2e2e]
                         border border-[#2e2e2e] hover:border-[#f5a623]/40
                         text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
              <ShoppingCart size={16} className="text-[#f5a623]" />
              <span className="hidden xs:inline">Cart</span>
              {count > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-[#f5a623] text-[#1a1a1a]
                                 text-xs font-bold rounded-full flex items-center justify-center">
                  {count}
                </span>
              )}
            </button>
          </div>
        </div>

        {!loading && categories.length > 0 && (
          <div className="border-t border-[#2e2e2e] overflow-x-auto scrollbar-hide">
            <div className="flex gap-1 px-4 py-2 w-max min-w-full">
              {allCategories.map((cat) => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg
                              text-xs font-semibold transition-colors whitespace-nowrap
                              min-h-[36px]
                              ${activeCategory === cat
                                ? "bg-[#f5a623] text-[#1a1a1a]"
                                : "text-[#9a9a9a] hover:text-white hover:bg-[#2e2e2e]"}`}>
                  {cat !== "All" && (CATEGORY_EMOJI[cat] ?? "🍽️")} {cat}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {!loading && (
        <StreakBanner completedOrders={completedOrders} />
      )}

      <main className="px-4 py-4 pb-24">

        {!loading && items.length > 0 && (
          <div className="flex items-center justify-end mb-4">
            <button onClick={() => setShowOutOfStock((v) => !v)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors
                          ${showOutOfStock
                            ? "bg-[#2e2e2e] text-[#9a9a9a] border-[#3a3a3a] hover:text-white"
                            : "bg-[#f5a623]/10 text-[#f5a623] border-[#f5a623]/30"}`}>
              {showOutOfStock ? "Showing all items" : "Hiding out-of-stock"}
            </button>
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-[#242424] border border-[#2e2e2e] rounded-2xl overflow-hidden animate-pulse">
                <div className="h-44 bg-[#2e2e2e]" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-[#2e2e2e] rounded w-3/4" />
                  <div className="h-3 bg-[#2e2e2e] rounded w-1/2" />
                  <div className="h-8 bg-[#2e2e2e] rounded mt-4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div className="w-20 h-20 rounded-2xl bg-[#242424] border border-[#2e2e2e]
                            flex items-center justify-center mb-5">
              <PackageX size={36} className="text-[#3a3a3a]" />
            </div>
            <h2 className="text-white font-semibold text-lg mb-2">No menu items available right now</h2>
            <p className="text-[#9a9a9a] text-sm max-w-xs">
              Check back soon — the kitchen is getting things ready.
            </p>
          </div>
        )}

        {!loading && items.length > 0 && visibleItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <PackageX size={40} className="text-[#3a3a3a] mb-3" />
            <p className="text-[#9a9a9a] text-sm">No items in this category right now.</p>
          </div>
        )}

        {!loading && Object.entries(groupedItems).map(([cat, catItems]) => (
          <div key={cat} className="mb-10">
            {activeCategory === "All" && queryParam !== "special" && (
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">{CATEGORY_EMOJI[cat] ?? "🍽️"}</span>
                <h2 className="text-white font-bold text-lg">{cat}</h2>
                <div className="flex-1 h-px bg-[#2e2e2e] ml-2" />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence>
                {catItems.map((item) => (
                  <ItemCard key={item.id} item={item} onAddToCart={handleAddToCart} />
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </main>

      <AnimatePresence>
        {count > 0 && !cartOpen && !checkoutOpen && (
          <motion.div
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 22, stiffness: 260 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50
                       w-[92%] max-w-md px-4"
            style={{ bottom: "max(16px, env(safe-area-inset-bottom, 16px))" }}>
            <button onClick={() => setCartOpen(true)}
              className="w-full flex items-center justify-between
                         bg-[#f5a623] text-[#1a1a1a] font-bold
                         px-5 py-3.5 rounded-2xl shadow-xl shadow-[#f5a623]/30
                         min-h-[52px]">
              <span className="bg-[#1a1a1a]/20 px-2 py-0.5 rounded-lg text-sm">
                {count} item{count > 1 ? "s" : ""}
              </span>
              <span className="text-sm">View Order</span>
              <span className="text-sm">₹{cartTotal(cart)}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cartOpen && (
          <>
            <motion.div key="cart-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setCartOpen(false)}
              className="fixed inset-0 bg-black/60 z-30 backdrop-blur-sm" />
            <CartDrawer
              cart={cart}
              onUpdateQty={handleUpdateQty}
              onClose={() => setCartOpen(false)}
              onCheckout={() => {
                setCartOpen(false);
                // Intercept: if there's a live Pending/Preparing order, ask first
                const canModify = activeOrder
                  && (activeOrder.status === "Pending" || activeOrder.status === "Preparing");
                if (canModify) {
                  setAddOrNewOpen(true);
                } else {
                  setCheckoutOpen(true);
                }
              }}
            />
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {checkoutOpen && (
          <CheckoutModal
            cart={cart}
            tableNumber={tableNumber}
            onUpdateQty={handleUpdateQty}
            onClose={() => setCheckoutOpen(false)}
            prefilledPhone={verifiedPhone}
            onOrderPlaced={() => {
              if (verifiedPhone) {
                recordOrder(verifiedPhone);
              }
              
              // Clear session data for fresh next order
              // Note: Only clear if this is NOT a special order, as special orders 
              // should not persist mode/table preferences
              const urlParams = new URLSearchParams(window.location.search);
              const isSpecialFilter = urlParams.get("filter") === "special";
              
              if (isSpecialFilter) {
                // Special orders: always clear to ensure fresh experience
                localStorage.removeItem("orderMode");
                localStorage.removeItem("tableNumber");
              } else {
                // Regular orders: clear for now, but this will be managed by OrderTracker
                // when the order actually completes
              }
              
              setCart({});
              setCheckoutOpen(false);
              setCartOpen(false);
              
              console.log('✅ Order placed successfully - session prepared for next order');
            }}
            completedOrders={completedOrders}
            fetchProfile={fetchProfile}
            recordOrder={recordOrder}
          />
        )}
      </AnimatePresence>

      {/* ── Order Tracker modal (opened via header button) ── */}
      <OrderTracker
        phone={verifiedPhone}
        open={trackerOpen}
        onOpenChange={setTrackerOpen}
        onAddMore={(order) => { setTrackerOpen(false); setModifyingOrder(order); }}
        onActiveOrderChange={handleActiveOrderChange}
      />

      {/* ── Add-to-current vs new order interception ── */}
      <AnimatePresence>
        {addOrNewOpen && activeOrder && (
          <AddOrNewModal
            activeOrder={activeOrder}
            cart={cart}
            onAddToCurrent={() => {
              setAddOrNewOpen(false);
              // Cart items have been pushed to the active order — clear cart
              setCart({});
              setCartOpen(false);
            }}
            onNewOrder={() => {
              setAddOrNewOpen(false);
              setCheckoutOpen(true);
            }}
            onClose={() => setAddOrNewOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Order Modification Sheet ── */}
      <AnimatePresence>
        {modifyingOrder && (
          <OrderModificationSheet
            order={modifyingOrder}
            menuItems={items}
            onClose={() => setModifyingOrder(null)}
          />
        )}
      </AnimatePresence>
        </div>
      </div>
    </div>
  );
}