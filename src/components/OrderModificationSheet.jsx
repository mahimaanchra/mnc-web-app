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

import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  doc, updateDoc, arrayUnion, increment, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";
import {
  X, Plus, Minus, ShoppingBag, ChefHat, CheckCircle2,
  UtensilsCrossed, Loader2, ChevronRight, AlertTriangle, Check,
} from "lucide-react";

// ─── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_EMOJI = {
  "Cold Coffee":"🧋","Mocktails":"🍹","Ice Tea":"🧊",
  "Shakes":"🥤","Hot Beverages":"☕","Burger":"🍔",
  "Sandwiches":"🥪","Vada Pav":"🫓","Pizza":"🍕","Single Topping Pizza":"🍕",
  "Fries & Munchies":"🍟","Chinese":"🥡","Maggi":"🍜",
  "Pasta":"🍝","Bread":"🍞","Wrap":"🌯",
  "Dessert":"🍨","Combos":"🎁",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function modCartKey(itemId, variantLabel, addons = []) {
  const addonKey = addons.map(a => `${a.label}:${a.price}`).sort().join('|');
  return `${itemId}__${variantLabel}__${addonKey}`;
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
    <div className="bg-[#1a1a1a] border border-[#2e2e2e] rounded-xl p-3">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold">{entry.itemName}</p>
          <p className="text-[#9a9a9a] text-xs">{entry.variantLabel}</p>
        </div>
      <div className="quantity-stepper-compact">
          <button
            type="button"
            onClick={() => onUpdateQty(cartKey, -1)}
            className="quantity-stepper-button"
            aria-label="Decrease quantity">
            <Minus className="quantity-stepper-icon" />
          </button>
          <div className="quantity-stepper-display">{entry.qty}</div>
          <button
            type="button"
            onClick={() => onUpdateQty(cartKey, +1)}
            className="quantity-stepper-button"
            aria-label="Increase quantity">
            <Plus className="quantity-stepper-icon" />
          </button>
        </div>
        <span className="text-amber-300 text-sm font-bold flex-shrink-0 min-w-[60px] text-right">
          ₹{entry.price * entry.qty}
        </span>
      </div>
      
      {entry.addons?.length > 0 && (
        <div className="border-t border-[#2e2e2e] pt-2">
          <p className="text-[#9a9a9a] text-xs mb-1">Add-ons:</p>
          <div className="flex flex-wrap gap-1">
            {entry.addons.map((addon, i) => (
              <span key={i} className="bg-amber-300/10 text-amber-300 text-xs px-2 py-1 rounded-lg border border-amber-300/30">
                +{addon.label} (₹{addon.price})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── McDonald's-Style Item Customization Modal ─────────────────────────────────

function ItemCustomizationModal({ item, onClose, onAdd }) {
  // Clean up variant label strings (e.g., removing stray semicolons like "L;")
  const sanitizedVariants = useMemo(() => {
    return (item.variants || []).map(v => ({
      ...v,
      label: v.label ? v.label.replace(/;/g, "").trim() : v.label
    }));
  }, [item.variants]);

  const [selectedVariant, setSelectedVariant] = useState(() => {
    const defaultVariant = sanitizedVariants[0] ?? null;
    console.log("🎯 Setting default variant:", defaultVariant);
    return defaultVariant;
  });
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [qty, setQty] = useState(1);
  const [imgErr, setImgErr] = useState(false);

  const toggleAddon = (addon) =>
    setSelectedAddons((prev) =>
      prev.some((a) => a.label === addon.label)
        ? prev.filter((a) => a.label !== addon.label)
        : [...prev, addon]
    );

  const addonTotal = selectedAddons.reduce((s, a) => s + a.price, 0);
  const unitPrice = (selectedVariant?.price ?? 0) + addonTotal;
  const totalPrice = unitPrice * qty;

  console.log("📊 ItemCustomizationModal state:", {
    itemName: item.name,
    sanitizedVariants,
    selectedVariant,
    selectedAddons,
    qty,
    unitPrice,
    totalPrice
  });

  return (
    <div className="fixed inset-0 z-70 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        className="bg-[#1e1e1e] border border-[#2e2e2e] w-full max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Modal Header */}
        <div className="relative p-4 border-b border-[#2e2e2e] flex items-center justify-between bg-[#181818]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#242424] overflow-hidden flex-shrink-0">
              {item.imageUrl && !imgErr ? (
                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" onError={() => setImgErr(true)} />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><UtensilsCrossed size={20} className="text-[#444]" /></div>
              )}
            </div>
            <div>
              <h3 className="text-white font-bold text-base leading-tight">{item.name}</h3>
              <p className="text-[#9a9a9a] text-xs mt-0.5 line-clamp-1">{item.description || item.category}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-[#9a9a9a] hover:text-white rounded-full bg-[#242424]">
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Variants Section */}
          {sanitizedVariants.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-white text-xs font-bold uppercase tracking-wider">Choose Variant / Size</h4>
                <span className="text-amber-300 text-xs">Required</span>
              </div>
              <div className="space-y-2">
                {sanitizedVariants.map((v) => {
                  const isSelected = selectedVariant?.label === v.label;
                  return (
                    <button
                      key={v.label}
                      type="button"
                      onClick={() => setSelectedVariant(v)}
                      className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all
                        ${isSelected ? "bg-amber-300/10 border-amber-300 text-white shadow-sm" : "bg-[#242424] border-[#2e2e2e] text-[#ccc] hover:border-[#444]"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors
                          ${isSelected ? "border-amber-300 bg-amber-300" : "border-[#555] bg-transparent"}`}>
                          {isSelected && <Check size={12} className="text-[#1a1a1a] stroke-[3]" />}
                        </div>
                        <span className="text-sm font-medium">{v.label}</span>
                      </div>
                      <span className="text-amber-300 font-bold text-sm">₹{v.price}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add-ons Section */}
          {item.addons?.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-white text-xs font-bold uppercase tracking-wider">Add-ons & Extras</h4>
                <span className="text-[#888] text-xs">Optional</span>
              </div>
              <div className="space-y-2">
                {item.addons.map((addon) => {
                  const active = selectedAddons.some((s) => s.label === addon.label);
                  return (
                    <button
                      key={addon.label}
                      type="button"
                      onClick={() => toggleAddon(addon)}
                      className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all
                        ${active ? "bg-amber-300/10 border-amber-300 text-white" : "bg-[#242424] border-[#2e2e2e] text-[#ccc] hover:border-[#444]"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors
                          ${active ? "border-amber-300 bg-amber-300" : "border-[#555] bg-transparent"}`}>
                          {active && <Check size={12} className="text-[#1a1a1a] stroke-[3]" />}
                        </div>
                        <span className="text-sm font-medium">{addon.label}</span>
                      </div>
                      <span className="text-amber-300 text-sm font-semibold">+₹{addon.price}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity Stepper */}
          <div>
            <h4 className="text-white text-xs font-bold uppercase tracking-wider mb-3">Quantity</h4>
            <div className="flex items-center justify-between bg-[#242424] border border-[#2e2e2e] rounded-xl p-3">
              <span className="text-sm text-[#ccc]">Select Quantity</span>
              <div className="flex items-center gap-3 bg-[#1e1e1e] border border-[#3a3a3a] rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  className="w-7 h-7 flex items-center justify-center text-[#aaa] hover:text-white rounded transition-colors"
                >
                  <Minus size={16} />
                </button>
                <span className="text-white text-sm font-bold w-6 text-center">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty(q => q + 1)}
                  className="w-7 h-7 flex items-center justify-center text-[#aaa] hover:text-white rounded transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#2e2e2e] bg-[#181818] flex items-center justify-between gap-4">
          <div>
            <span className="text-[#9a9a9a] text-xs block">Total Price</span>
            <span className="text-amber-300 font-bold text-lg">₹{totalPrice}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              console.log("🔘 Add button clicked in customization modal", {
                selectedVariant,
                hasSelectedVariant: !!selectedVariant,
                item: item.name,
                qty,
                unitPrice,
                selectedAddons
              });
              
              if (!selectedVariant) {
                console.error("❌ No variant selected - cannot add item");
                alert("Please select a size/variant before adding to order");
                return;
              }
              
              console.log("✅ Calling onAdd with data:", {
                item, 
                variant: selectedVariant, 
                price: unitPrice, 
                addons: selectedAddons, 
                qty
              });
              
              onAdd({ item, variant: selectedVariant, price: unitPrice, addons: selectedAddons, qty });
              onClose();
            }}
            disabled={!selectedVariant}
            className="flex-1 bg-amber-400 hover:bg-amber-300 disabled:bg-gray-600 disabled:cursor-not-allowed text-[#1a1a1a] font-bold py-3.5 px-6 rounded-xl text-sm transition-colors shadow-md flex items-center justify-center gap-2"
          >
            <span>Add to Order</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── McDonald's-Style Compact Menu Tile ────────────────────────────────────────

function ModMenuTile({ item, onSelect }) {
  const [imgErr, setImgErr] = useState(false);
  
  if (!item.inStock) return null;

  const basePrice = item.variants?.[0]?.price ?? 0;

  const handleAddClick = useCallback((e) => {
    e.stopPropagation();
    console.log("🔥 Add button clicked for:", item.name);
    
    if (onSelect && typeof onSelect === 'function') {
      onSelect(item);
    } else {
      console.error("❌ onSelect is not a function:", typeof onSelect);
    }
  }, [item, onSelect]);

  const handleTileClick = useCallback(() => {
    console.log("🔘 Tile clicked for:", item.name);
    if (onSelect && typeof onSelect === 'function') {
      onSelect(item);
    }
  }, [item, onSelect]);

  return (
    <div
      onClick={handleTileClick}
      className="bg-[#242424] border border-[#2e2e2e] rounded-xl overflow-hidden p-3.5 flex items-center justify-between gap-4 cursor-pointer hover:border-amber-300/40 transition-all active:scale-[0.99]"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="w-16 h-16 rounded-xl bg-[#1e1e1e] overflow-hidden flex-shrink-0">
          {item.imageUrl && !imgErr ? (
            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" onError={() => setImgErr(true)} />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><UtensilsCrossed size={20} className="text-[#3a3a3a]" /></div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold truncate">{item.name}</p>
          <p className="text-[#9a9a9a] text-xs truncate mt-0.5 max-w-[200px]">
            {item.description || item.category}
          </p>
          <p className="text-amber-300 text-xs font-bold mt-1">₹{basePrice}{item.variants?.length > 1 ? "+" : ""}</p>
        </div>
      </div>

      <div className="flex-shrink-0">
        <button
          type="button"
          onClick={handleAddClick}
          className="bg-amber-400 hover:bg-amber-300 text-[#1a1a1a] font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1 transition-colors shadow-sm"
        >
          <Plus size={14} className="stroke-[3]" />
          <span>Add</span>
        </button>
      </div>
    </div>
  );
}

// ─── Main OrderModificationSheet ──────────────────────────────────────────────

export default function OrderModificationSheet({ order, menuItems, onClose }) {
  const [modCart, setModCart]   = useState({});
  const [note, setNote]         = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]   = useState(false);
  const [error, setError]       = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeCustomizeItem, setActiveCustomizeItem] = useState(null);
  
  // Track customization modal state
  useEffect(() => {
    console.log("🎭 activeCustomizeItem changed:", activeCustomizeItem?.name || "null");
  }, [activeCustomizeItem]);

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

  const handleAddCustomizedItem = ({ item, variant, price, addons = [], qty = 1 }) => {
    console.log("🍽️ Adding item to modification cart:", {
      itemId: item.id,
      itemName: item.name,
      variant: variant.label,
      price,
      addons,
      qty
    });

    const key = modCartKey(item.id, variant.label, addons);
    
    setModCart((prev) => {
      const updatedCart = {
        ...prev,
        [key]: prev[key]
          ? { ...prev[key], qty: prev[key].qty + qty }
          : {
              itemId: item.id,
              itemName: item.name,
              variantLabel: variant.label,
              price,
              qty,
              addons: addons || [],
            },
      };
      
      console.log("🛒 Updated modification cart:", updatedCart);
      console.log("📊 Cart totals after update:", {
        count: modCartCount(updatedCart),
        total: modCartTotal(updatedCart)
      });
      
      return updatedCart;
    });
    
    // Force component re-render
    setCartUpdate(prev => prev + 1);
  };

  const handleUpdateQty = (key, delta) => {
    setModCart((prev) => {
      const entry = prev[key];
      if (!entry) return prev;
      const newQty = entry.qty + delta;
      if (newQty <= 0) {
        const { [key]: _, ...rest } = prev;
        console.log("🗑️ Removing item from cart:", key);
        return rest;
      }
      const updatedCart = { ...prev, [key]: { ...entry, qty: newQty } };
      console.log("📊 Updated quantity:", { key, newQty, cartTotal: modCartTotal(updatedCart) });
      return updatedCart;
    });
    
    // Force component re-render
    setCartUpdate(prev => prev + 1);
  };

  // Calculate cart values (no memoization to ensure immediate updates)
  const cartEntries = Object.entries(modCart);
  const addedTotal = modCartTotal(modCart);
  const addedCount = modCartCount(modCart);
  const newRunningTotal = (order.totalPrice ?? 0) + addedTotal;

  console.log("🔄 Bottom bar state:", {
    cartEntries: cartEntries.length,
    addedCount,
    addedTotal,
    newRunningTotal,
    modCart
  });

  const handleConfirm = async () => {
    if (addedCount === 0) {
      console.log("❌ Cannot confirm - no items added to modification cart");
      return;
    }
    
    console.log("🚀 Starting order modification...", {
      orderId: order.id,
      orderStatus: order.status,
      addedCount,
      addedTotal,
      isModifiable
    });
    
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
          addons:       e.addons || [],
          status:       "Pending",
          addedAt:      new Date(),
        })),
        addedPrice: addedTotal,
        addedAt:    new Date().toISOString(),
        note:       note.trim() || null,
      };

      console.log("📦 Modification payload:", modPayload);

      const updateData = {
        modifications:   arrayUnion(modPayload),
        totalPrice:      increment(addedTotal),
        hasModification: true,
        lastModifiedAt:  serverTimestamp(),
      };

      console.log("🔄 Updating Firestore document:", order.id, updateData);

      await updateDoc(doc(db, "orders", order.id), updateData);

      console.log("✅ Order modification successful!");
      
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2200);
    } catch (err) {
      console.error("❌ Modification failed:", err);
      console.error("Error details:", {
        message: err.message,
        code: err.code,
        stack: err.stack,
        orderId: order.id,
        orderStatus: order.status,
        modPayload: cartEntries
      });
      setError(`Could not update your order: ${err.message || 'Unknown error'}. Please try again.`);
    } finally {
      setSubmitting(false);
    }
  };

  const isModifiable = order.status === "Open";
  
  console.log("📋 OrderModificationSheet initialized:", {
    orderId: order.id,
    orderStatus: order.status,
    isModifiable,
    tableNumber: order.tableNumber,
    totalPrice: order.totalPrice,
    hasModifications: order.hasModification
  });

  return (
    <>
      <motion.div
        key="mod-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={!submitting ? onClose : undefined}
        className="fixed inset-0 bg-black/75 z-50 backdrop-blur-sm"
      />

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
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#3a3a3a]" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-[#2e2e2e] flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-base flex items-center gap-2">
              <ShoppingBag size={17} className="text-[#f5a623]" />
              Add to Order
            </h2>
            <p className="text-[#9a9a9a] text-xs mt-0.5">
              Table {order.tableNumber ?? "—"} ·{" "}
              <span className={`font-semibold ${order.status === "Open" ? "text-blue-400" : "text-green-400"}`}>
                {order.status === "Open" ? "🍽️ Open Tab" : "✅ Completed"}
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

        {!isModifiable && (
          <div className="px-5 py-4 flex items-center gap-3 bg-red-500/10 border-b border-red-500/20">
            <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
            <p className="text-red-400 text-sm">
              This order can no longer be modified (status: {order.status}).
            </p>
          </div>
        )}

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
            <div className="flex-1 overflow-y-auto">
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

              <div className="overflow-x-auto scrollbar-hide border-b border-[#2e2e2e]">
                <div className="flex gap-2 px-4 py-3 w-max">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveCategory(cat)}
                      className={`flex-shrink-0 flex items-center justify-center px-4 py-2.5 rounded-xl
                                  text-xs font-semibold transition-all duration-200 whitespace-nowrap
                                  min-h-[40px] min-w-fit border
                                  ${activeCategory === cat
                                    ? "bg-[#f5a623] text-[#1a1a1a] border-[#f5a623] shadow-sm scale-105"
                                    : "text-[#9a9a9a] hover:text-white hover:bg-[#2e2e2e] border-[#3a3a3a] hover:border-[#f5a623]/50"}`}
                    >
                      <span className="truncate max-w-[120px]">
                        {cat !== "All" && (CATEGORY_EMOJI[cat] ?? "🍽️")} {cat}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-4 py-4 space-y-2.5">
                {visibleItems.length === 0 ? (
                  <p className="text-[#9a9a9a] text-sm text-center py-8">
                    No items available in this category.
                  </p>
                ) : (
                  visibleItems.map((item) => (
                    <ModMenuTile 
                      key={item.id} 
                      item={item} 
                      onSelect={setActiveCustomizeItem} 
                    />
                  ))
                )}
              </div>

              <div className="h-32" />
            </div>

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
                key={`confirm-${addedCount}-${addedTotal}`}
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

      {/* Pop-up Customization Modal */}
      <AnimatePresence>
        {activeCustomizeItem && (
          <>
            {console.log("🎭 Rendering ItemCustomizationModal for item:", {
              itemId: activeCustomizeItem.id,
              itemName: activeCustomizeItem.name,
              hasOnAdd: !!handleAddCustomizedItem
            })}
            <ItemCustomizationModal
              item={activeCustomizeItem}
              onClose={() => {
                console.log("🚪 Closing customization modal");
                setActiveCustomizeItem(null);
              }}
              onAdd={handleAddCustomizedItem}
            />
          </>
        )}
      </AnimatePresence>
    </>
  );
}