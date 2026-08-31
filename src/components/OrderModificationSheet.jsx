/**
 * OrderModificationSheet.jsx
 *
 * Slide-up sheet that lets a customer browse the menu and add items
 * to an existing Pending/Preparing order.
 *
 * Firestore write:
 *   orders/{orderId}  →  arrayUnion on `modifications` field
 *   Each element: { items: [...], addedPrice, addedAt, note? }
 *   Also increments totalPrice by addedPrice (via updateDoc).
 *
 * Backward-compatible: old orders without `modifications` treat it as [].
 *
 * Props:
 *   order       – the active Firestore order document (with .id)
 *   menuItems   – full menu items array (from CustomerMenu state)
 *   onClose     – fn() close the sheet
 */

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  doc, updateDoc, arrayUnion, increment, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";
import {
  X, Plus, Minus, ShoppingBag, ChefHat, CheckCircle2,
  UtensilsCrossed, Loader2, ChevronRight, AlertTriangle,
} from "lucide-react";

// ─── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_EMOJI = {
  "Cold Coffee":"🧋","Mocktails":"🍹","Ice Tea":"🧊",
  "Shakes":"🥤","Hot Beverages":"☕","Burger":"🍔",
  "Sandwiches":"🥪","Vada Pav":"🫓","Pizza":"🍕",
  "Fries":"🍟","Chinese":"🥡","Maggi":"🍜",
  "Pasta":"🍝","Bread":"🍞","Wrap":"🌯",
  "Dessert":"🍨","Combos":"🎁",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function modCartKey(itemId, variantLabel) {
  return `${itemId}__${variantLabel}`;
}

function modCartTotal(cart) {
  return Object.values(cart).reduce((s, e) => s + e.price * e.qty, 0);
}

function modCartCount(cart) {
  return Object.values(cart).reduce((s, e) => s + e.qty, 0);
}

// ─── Compact item row for the modification cart ───────────────────────────────

function ModCartRow({ entry, cartKey, onUpdateQty }) {
  return (
    <div className="flex items-center gap-3 bg-[#1a1a1a] border border-[#2e2e2e] rounded-xl px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-semibold truncate">{entry.itemName}</p>
        <p className="text-[#9a9a9a] text-[11px]">{entry.variantLabel}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={() => onUpdateQty(cartKey, -1)}
          className="w-6 h-6 rounded-lg bg-[#2e2e2e] border border-[#3a3a3a]
                     flex items-center justify-center text-[#9a9a9a]
                     hover:text-white transition-colors active:scale-90"
        >
          <Minus size={10} />
        </button>
        <span className="text-white text-xs font-bold w-4 text-center">{entry.qty}</span>
        <button
          type="button"
          onClick={() => onUpdateQty(cartKey, +1)}
          className="w-6 h-6 rounded-lg bg-[#2e2e2e] border border-[#3a3a3a]
                     flex items-center justify-center text-[#9a9a9a]
                     hover:text-white transition-colors active:scale-90"
        >
          <Plus size={10} />
        </button>
      </div>
      <span className="text-[#f5a623] text-xs font-bold flex-shrink-0 w-12 text-right">
        ₹{entry.price * entry.qty}
      </span>
    </div>
  );
}

// ─── Compact menu item tile ────────────────────────────────────────────────────

function ModMenuTile({ item, onAdd }) {
  const [selectedVariant, setSelectedVariant] = useState(item.variants?.[0] ?? null);
  const [imgErr, setImgErr] = useState(false);

  if (!item.inStock) return null; // hide out-of-stock in this view

  const linePrice = selectedVariant?.price ?? 0;

  return (
    <div className="bg-[#242424] border border-[#2e2e2e] rounded-xl overflow-hidden flex gap-3 p-3">
      {/* Thumbnail */}
      <div className="w-16 h-16 rounded-lg bg-[#1e1e1e] overflow-hidden flex-shrink-0">
        {item.imageUrl && !imgErr ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UtensilsCrossed size={20} className="text-[#3a3a3a]" />
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold leading-tight truncate">{item.name}</p>

        {/* Variant chips — compact */}
        {item.variants?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {item.variants.map((v) => (
              <button
                key={v.label}
                type="button"
                onClick={() => setSelectedVariant(v)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-colors
                  ${selectedVariant?.label === v.label
                    ? "bg-[#f5a623] text-[#1a1a1a] border-[#f5a623]"
                    : "bg-[#1a1a1a] text-[#9a9a9a] border-[#3a3a3a] hover:border-[#f5a623]/40"}`}
              >
                {v.label} ₹{v.price}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Add button */}
      <div className="flex flex-col items-end justify-between flex-shrink-0">
        <span className="text-[#f5a623] text-sm font-bold">₹{linePrice}</span>
        <button
          type="button"
          onClick={() => {
            if (!selectedVariant) return;
            onAdd({ item, variant: selectedVariant, price: linePrice });
          }}
          className="flex items-center gap-1 bg-[#f5a623] hover:bg-[#e08a00]
                     text-[#1a1a1a] text-xs font-bold px-3 py-1.5 rounded-lg
                     transition-colors active:scale-95 mt-1"
        >
          <Plus size={11} /> Add
        </button>
      </div>
    </div>
  );
}

// ─── Main OrderModificationSheet ──────────────────────────────────────────────

export default function OrderModificationSheet({ order, menuItems, onClose }) {
  const [modCart, setModCart]   = useState({}); // key → {itemId, itemName, variantLabel, price, qty}
  const [note, setNote]         = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]   = useState(false);
  const [error, setError]       = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  // Derive unique categories from the menu
  const categories = useMemo(() => {
    const seen = new Set();
    const cats = [];
    menuItems.forEach((item) => {
      if (item.inStock && !seen.has(item.category)) {
        seen.add(item.category);
        cats.push(item.category);
      }
    });
    return ["All", ...cats];
  }, [menuItems]);

  const visibleItems = useMemo(() =>
    menuItems.filter(
      (item) => item.inStock && (activeCategory === "All" || item.category === activeCategory),
    ),
  [menuItems, activeCategory]);

  // Cart helpers
  const handleAdd = ({ item, variant, price }) => {
    const key = modCartKey(item.id, variant.label);
    setModCart((prev) => ({
      ...prev,
      [key]: prev[key]
        ? { ...prev[key], qty: prev[key].qty + 1 }
        : {
            itemId: item.id,
            itemName: item.name,
            variantLabel: variant.label,
            price,
            qty: 1,
          },
    }));
  };

  const handleUpdateQty = (key, delta) => {
    setModCart((prev) => {
      const entry = prev[key];
      if (!entry) return prev;
      const newQty = entry.qty + delta;
      if (newQty <= 0) {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: { ...entry, qty: newQty } };
    });
  };

  const cartEntries = Object.entries(modCart);
  const addedTotal  = modCartTotal(modCart);
  const addedCount  = modCartCount(modCart);

  // `order.totalPrice` is already the live running total (Firestore incremented it).
  // We only add `addedTotal` from the current in-progress mod cart — nothing else.
  const newRunningTotal = (order.totalPrice ?? 0) + addedTotal;

  const handleConfirm = async () => {
    if (addedCount === 0) return;
    setSubmitting(true);
    setError("");

    try {
      const modPayload = {
        items: cartEntries.map(([, e]) => ({
          itemId:       e.itemId,
          itemName:     e.itemName,
          variantLabel: e.variantLabel,
          price:        e.price,
          qty:          e.qty,
        })),
        addedPrice: addedTotal,
        // ISO string — serverTimestamp() cannot be used inside arrayUnion payloads
        // because Firestore cannot resolve server-side sentinels inside array diffs
        addedAt:    new Date().toISOString(),
        note:       note.trim() || null,
      };

      await updateDoc(doc(db, "orders", order.id), {
        modifications:   arrayUnion(modPayload),
        totalPrice:      increment(addedTotal),
        hasModification: true,
        lastModifiedAt:  serverTimestamp(),
      });

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2200);
    } catch (err) {
      console.error("Modification failed:", err);
      setError("Could not update your order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const isModifiable = order.status === "Pending" || order.status === "Preparing";

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="mod-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={!submitting ? onClose : undefined}
        className="fixed inset-0 bg-black/75 z-50 backdrop-blur-sm"
      />

      {/* Sheet */}
      <motion.div
        key="mod-sheet"
        initial={{ y: "100%", opacity: 0.9 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0.9 }}
        transition={{ type: "spring", damping: 30, stiffness: 320 }}
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col
                   bg-[#1e1e1e] border-t border-[#2e2e2e] rounded-t-3xl
                   max-h-[92vh] overflow-hidden"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#3a3a3a]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#2e2e2e] flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-base flex items-center gap-2">
              <ShoppingBag size={17} className="text-[#f5a623]" />
              Add to Order
            </h2>
            <p className="text-[#9a9a9a] text-xs mt-0.5">
              Table {order.tableNumber ?? "—"} ·{" "}
              <span className={`font-semibold ${order.status === "Pending" ? "text-yellow-400" : "text-blue-400"}`}>
                {order.status === "Pending" ? "⏳ Pending" : "👨‍🍳 Preparing"}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9a9a9a] hover:text-white hover:bg-[#2e2e2e] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Non-modifiable guard */}
        {!isModifiable && (
          <div className="px-5 py-4 flex items-center gap-3 bg-red-500/10 border-b border-red-500/20">
            <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
            <p className="text-red-400 text-sm">
              This order can no longer be modified (status: {order.status}).
            </p>
          </div>
        )}

        {/* Success state */}
        {success ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 14 }}
              className="w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-500/40
                         flex items-center justify-center mb-5"
            >
              <CheckCircle2 size={40} className="text-green-400" />
            </motion.div>
            <h3 className="text-white font-bold text-xl mb-2">Items Added! 🎉</h3>
            <p className="text-[#9a9a9a] text-sm leading-relaxed max-w-xs">
              Your additional items have been sent to the kitchen.
            </p>
            <div className="mt-4 bg-[#242424] border border-[#2e2e2e] rounded-xl px-5 py-3">
              <p className="text-[#9a9a9a] text-xs">New Running Total</p>
              <p className="text-[#f5a623] font-bold text-2xl">₹{newRunningTotal}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">

              {/* Mod cart summary — sticky inside scroll */}
              {cartEntries.length > 0 && (
                <div className="sticky top-0 z-10 bg-[#1e1e1e] border-b border-[#f5a623]/20 px-4 py-3">
                  <p className="text-[#f5a623] text-xs font-bold uppercase tracking-wider mb-2">
                    Items to Add ({addedCount})
                  </p>
                  <div className="space-y-1.5">
                    {cartEntries.map(([key, entry]) => (
                      <ModCartRow
                        key={key}
                        cartKey={key}
                        entry={entry}
                        onUpdateQty={handleUpdateQty}
                      />
                    ))}
                  </div>
                  {/* Note field */}
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note for the kitchen (optional)…"
                    maxLength={120}
                    className="w-full mt-2.5 bg-[#1a1a1a] border border-[#3a3a3a] text-white
                               placeholder-[#555] rounded-xl px-3 py-2 text-xs
                               focus:outline-none focus:border-[#f5a623]/60 transition-colors"
                  />
                </div>
              )}

              {/* Category filter */}
              <div className="overflow-x-auto scrollbar-hide border-b border-[#2e2e2e]">
                <div className="flex gap-1 px-4 py-2.5 w-max">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveCategory(cat)}
                      className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg
                                  text-xs font-semibold transition-colors whitespace-nowrap
                                  ${activeCategory === cat
                                    ? "bg-[#f5a623] text-[#1a1a1a]"
                                    : "text-[#9a9a9a] hover:text-white hover:bg-[#2e2e2e]"}`}
                    >
                      {cat !== "All" && (CATEGORY_EMOJI[cat] ?? "🍽️")} {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Menu tiles */}
              <div className="px-4 py-4 space-y-2.5">
                {visibleItems.length === 0 ? (
                  <p className="text-[#9a9a9a] text-sm text-center py-8">
                    No items available in this category.
                  </p>
                ) : (
                  visibleItems.map((item) => (
                    <ModMenuTile key={item.id} item={item} onAdd={handleAdd} />
                  ))
                )}
              </div>

              {/* Safe-area spacer */}
              <div className="h-32" />
            </div>

            {/* ── Footer CTA — fixed at bottom ── */}
            <div className="flex-shrink-0 border-t border-[#2e2e2e] px-4 pt-3 pb-safe bg-[#1e1e1e]"
                 style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom, 20px))" }}>
              {error && (
                <p className="text-red-400 text-xs mb-2 flex items-center gap-1">
                  <AlertTriangle size={12} /> {error}
                </p>
              )}

              {cartEntries.length > 0 && (
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-[#9a9a9a] text-xs">Adding</span>
                    <span className="text-[#f5a623] font-bold text-base ml-2">₹{addedTotal}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[#9a9a9a] text-xs">New total</span>
                    <span className="text-white font-bold text-base ml-2">₹{newRunningTotal}</span>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleConfirm}
                disabled={addedCount === 0 || submitting || !isModifiable}
                className="w-full flex items-center justify-center gap-2
                           bg-[#f5a623] hover:bg-[#e08a00]
                           disabled:opacity-40 disabled:cursor-not-allowed
                           text-[#1a1a1a] font-bold py-3.5 rounded-xl text-sm
                           transition-colors shadow-lg shadow-[#f5a623]/20 active:scale-[0.98]"
              >
                {submitting ? (
                  <><Loader2 size={16} className="animate-spin" /> Sending to Kitchen…</>
                ) : addedCount === 0 ? (
                  <>
                    <ChefHat size={16} /> Pick items to add
                  </>
                ) : (
                  <>
                    Confirm Add {addedCount} Item{addedCount !== 1 ? "s" : ""} · ₹{addedTotal}
                    <ChevronRight size={16} />
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}
