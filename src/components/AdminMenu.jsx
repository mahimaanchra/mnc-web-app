import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, query, orderBy, getDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  Plus, Trash2, Pencil, X,
  ToggleLeft, ToggleRight, ImageIcon, ChevronDown,
  Loader2, PackageX, UtensilsCrossed, ArrowLeft,
  LogOut, ClipboardList, LayoutGrid, Clock,
  CheckCircle2, ChefHat, CircleDollarSign, Volume2, Sparkles, Archive,
  Upload, ChevronRight
} from "lucide-react";

// Image compression utilities
const compressImage = (file, maxWidth = 800, maxHeight = 600, quality = 0.8) => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      // Calculate new dimensions
      let { width, height } = img;
      
      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to base64 with compression
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };
    
    img.src = URL.createObjectURL(file);
  });
};

const validateImageSize = (base64String, maxSizeKB = 800) => {
  // Base64 encoding increases size by ~33%, so we check actual bytes
  const sizeInBytes = (base64String.length * 3) / 4;
  const sizeInKB = sizeInBytes / 1024;
  return sizeInKB <= maxSizeKB;
};

const CATEGORIES = [
  "Cold Coffee","Mocktails","Ice Tea","Shakes","Hot Beverages",
  "Burger","Sandwiches","Vada Pav","Pizza","Fries",
  "Chinese","Maggi","Pasta","Bread","Wrap","Dessert","Combos",
];

const SAMPLE_IMAGES = [
  { label: "Cold Coffee", url: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400&q=80" },
  { label: "Burger",      url: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80" },
  { label: "Pizza",       url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&q=80" },
  { label: "Shake",       url: "https://images.unsplash.com/photo-1572490122747-3e9bc1658350?w=400&q=80" },
  { label: "Fries",       url: "https://images.unsplash.com/photo-1562059390-a761a084768e?w=400&q=80" },
  { label: "Sandwich",    url: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&q=80" },
];

const EMPTY_FORM = {
  name: "", category: CATEGORIES[0], description: "", imageUrl: "",
  imageFile: null,  // New: for file uploads
  variants: [{ label: "", price: "", inStock: true }],
  addons:   [{ label: "", price: "" }],
  inStock: true,
  isMncSpecial: false,
};

const ITEM_STATUSES = ["Pending", "Preparing", "Ready"];

const STATUS_META = {
  // Master Order Statuses
  Open:      { color: "bg-blue-500/15 text-blue-400 border-blue-500/30",     icon: <Clock size={13} /> },
  Completed: { color: "bg-green-500/15 text-green-400 border-green-500/30",  icon: <CircleDollarSign size={13} /> },
  
  // Individual Item Statuses  
  Pending:   { color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", icon: <Clock size={13} /> },
  Preparing: { color: "bg-blue-500/15 text-blue-400 border-blue-500/30",       icon: <ChefHat size={13} /> },
  Ready:     { color: "bg-amber-500/15 text-amber-400 border-amber-500/30",    icon: <CheckCircle2 size={13} /> },
};

// ─── Simplified Single-Play Audio Notification System ──────────────────────────
// Features:
//   - Single loud alert per event (no looping)
//   - Two distinct sounds: New Order vs Item Addition
//   - Clean interface without acknowledgment buttons
//   - Prevents audio irritation from multiple orders

let _audioCtx = null;
let _pendingChime = null; // "order" | "modification" | null — last pending chime type

function resumeAudioCtx() {
  if (!_audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    _audioCtx = new AC();
  }
  if (_audioCtx.state === "suspended") {
    _audioCtx.resume().then(() => {
      // Drain any queued chime now that the context is running
      if (_pendingChime === "modification") _playModificationTones();
      else if (_pendingChime === "order") _playOrderTones();
      _pendingChime = null;
    });
  } else {
    // Context already running — still drain pending if any
    if (_pendingChime === "modification") _playModificationTones();
    else if (_pendingChime === "order") _playOrderTones();
    _pendingChime = null;
  }
}

// Single-play new order notification - Loud and attention-grabbing
function _playOrderTones() {
  const ctx = _audioCtx;
  if (!ctx) return;
  try {
    // NEW ORDER: Loud rising urgent chime sequence
    const playSequence = () => {
      // Tone 1 - Alert start (low to mid) - LOUDER
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(440, ctx.currentTime); // A4
      osc1.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.15); // E5
      gain1.gain.setValueAtTime(0.9, ctx.currentTime); // Increased volume
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.3);

      // Tone 2 - Attention peak (high) - LOUDER
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.4); // A5
      gain2.gain.setValueAtTime(1.0, ctx.currentTime + 0.4); // Maximum safe volume
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.4);
      osc2.stop(ctx.currentTime + 0.7);

      // Tone 3 - Confirmation (mid to high) - LOUDER
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = "sine";
      osc3.frequency.setValueAtTime(523.25, ctx.currentTime + 0.8); // C5
      osc3.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 1.1); // C6
      gain3.gain.setValueAtTime(0.9, ctx.currentTime + 0.8); // Increased volume
      gain3.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.4);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(ctx.currentTime + 0.8);
      osc3.stop(ctx.currentTime + 1.4);
    };

    playSequence();
  } catch (err) {
    console.error("_playOrderTones error:", err);
  }
}

// Single-play item addition notification - Distinct from new orders
function _playModificationTones() {
  const ctx = _audioCtx;
  if (!ctx) return;
  try {
    // ITEM ADDITION: Loud double-bounce notification pattern
    const playTone = (freq, startTime, duration, volume = 0.8, waveType = "square") => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = waveType;
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(volume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    
    // Distinctive loud double-bounce pattern for modifications
    playTone(698.46, ctx.currentTime, 0.12, 0.9, "triangle"); // F5 - short, louder
    playTone(698.46, ctx.currentTime + 0.15, 0.12, 0.9, "triangle"); // F5 - short (bounce), louder
    playTone(932.33, ctx.currentTime + 0.35, 0.2, 1.0, "sine"); // Bb5 - longer confirmation, loudest
  } catch (err) {
    console.error("_playModificationTones error:", err);
  }
}

// Simple single-play notification functions
function playOrderChime() {
  const ctx = _audioCtx;
  if (!ctx || ctx.state === "suspended") {
    _pendingChime = "order";
    return;
  }
  _pendingChime = null;
  ctx.resume().then(_playOrderTones).catch(console.error);
}

function playModificationChime() {
  const ctx = _audioCtx;
  if (!ctx || ctx.state === "suspended") {
    _pendingChime = "modification";
    return;
  }
  _pendingChime = null;
  ctx.resume().then(_playModificationTones).catch(console.error);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const sanitizeItem = (form) => ({
  name:         form.name.trim(),
  category:     form.category,
  description:  form.description.trim(),
  imageUrl:     form.imageUrl.trim(),
  variants: form.variants
    .filter((v) => v.label.trim() !== "" && v.price !== "")
    .map((v)    => ({ 
      label: v.label.trim(), 
      price: parseFloat(v.price),
      inStock: v.inStock !== false // Default to true if not explicitly set
    })),
  addons: form.addons
    .filter((a) => a.label.trim() !== "" && a.price !== "")
    .map((a)    => ({ label: a.label.trim(), price: parseFloat(a.price) })),
  inStock:      form.inStock,
  isMncSpecial: form.isMncSpecial,
});

function timeAgo(ts) {
  if (!ts) return "";
  const secs = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (secs < 60)  return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

// ─── Sub-Components ─────────────────────────────────────────────────────────────

function PairRow({ item, index, total, onUpdate, onRemove, isVariant = false }) {
  return (
    <div className="flex gap-2 items-center">
      <input
        type="text"
        placeholder={index === 0 ? 'e.g. "Medium" or "Cheese Slice"' : "label"}
        value={item.label}
        onChange={(e) => onUpdate(index, "label", e.target.value)}
        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900
                   focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
      />
      <div className="relative flex items-center">
        <span className="absolute left-3 text-gray-500 text-sm select-none">₹</span>
        <input
          type="number" min="0" placeholder="0" value={item.price}
          onChange={(e) => onUpdate(index, "price", e.target.value)}
          className="w-24 pl-7 border border-gray-300 rounded-lg py-2 text-sm bg-white text-gray-900
                     focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
        />
      </div>
      {isVariant && (
        <button
          type="button"
          onClick={() => onUpdate(index, "inStock", !(item.inStock !== false))}
          className={`p-2 rounded-lg border transition-colors ${
            item.inStock !== false 
              ? "bg-green-50 border-green-200 text-green-600 hover:bg-green-100" 
              : "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
          }`}
          title={`Toggle variant stock (${item.inStock !== false ? 'In Stock' : 'Out of Stock'})`}
        >
          {item.inStock !== false ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
        </button>
      )}
      <button
        type="button" onClick={() => onRemove(index)} disabled={total === 1}
        className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50
                   disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <X size={15} />
      </button>
    </div>
  );
}

function DynamicPairList({ items, onChange, addLabel, isVariant = false }) {
  const handleUpdate = (i, field, val) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, [field]: val } : it)));
  const handleRemove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const handleAdd    = ()  => onChange([...items, isVariant 
    ? { label: "", price: "", inStock: true } 
    : { label: "", price: "" }]);
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <PairRow key={i} item={item} index={i} total={items.length}
          onUpdate={handleUpdate} onRemove={handleRemove} isVariant={isVariant} />
      ))}
      <button type="button" onClick={handleAdd}
        className="flex items-center gap-1.5 text-sm text-amber-600 hover:text-amber-700 font-medium mt-1">
        <Plus size={14} />{addLabel}
      </button>
    </div>
  );
}

function StatCard({ label, value, colorClasses }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${colorClasses}`}>
      <p className="text-2xl sm:text-3xl font-bold leading-tight">{value}</p>
      <p className="text-xs sm:text-sm font-medium opacity-75 mt-0.5">{label}</p>
    </div>
  );
}

function MenuItemCard({ item, onEdit, onDelete, onToggleVariantStock, onToggleSpecial, isDeleting, isToggling }) {
  // Calculate overall item availability based on variants
  const hasAvailableVariants = item.variants?.length > 0 
    ? item.variants.some(v => v.inStock !== false)
    : item.inStock;

  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.18 }}
      className={`bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm flex flex-col
                  ${!hasAvailableVariants ? "opacity-60" : ""}`}
    >
      <div className="relative h-44 bg-gray-100 overflow-hidden">
        {item.imageUrl
          ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = "none"; }} />
          : <div className="absolute inset-0 flex items-center justify-center bg-amber-50">
              <UtensilsCrossed size={36} className="text-amber-300" /></div>
        }
        <span className="absolute top-2 left-2 bg-white/90 text-amber-700 text-xs font-semibold
                         px-2.5 py-1 rounded-full border border-amber-100 backdrop-blur-sm">
          {item.category}
        </span>
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full text-white
                           ${hasAvailableVariants ? "bg-green-500" : "bg-red-500"}`}>
            {hasAvailableVariants ? "Available" : "Out of Stock"}
          </span>
          {item.isMncSpecial && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white shadow flex items-center gap-1">
              <Sparkles size={10} /> MNC Special
            </span>
          )}
        </div>
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-semibold text-gray-900 text-base leading-tight">{item.name}</h3>
        {item.description &&
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>}
        
        {/* Variant-Level Stock Management */}
        {item.variants?.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-600 mb-1.5">Variant Stock Control</p>
            <div className="flex flex-wrap gap-1.5">
              {item.variants.map((v, i) => {
                const isInStock = v.inStock !== false; // Default to true if not set
                return (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 border">
                    <span className="text-xs font-medium text-gray-700 flex-1">
                      {v.label} — ₹{v.price}
                    </span>
                    <button 
                      type="button" 
                      onClick={() => onToggleVariantStock(item.id, i, !isInStock)} 
                      disabled={isToggling}
                      className={`w-1.5 h-1.5 rounded-full transition-colors disabled:opacity-50 ${
                        isInStock 
                          ? "bg-green-500" 
                          : "bg-red-500"
                      }`}
                      title={`Toggle ${v.label} stock (${isInStock ? 'In Stock' : 'Out of Stock'})`}
                    >
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-auto pt-4 space-y-2">
          <div className="flex items-center gap-2">
            {/* Overall Availability Indicator */}
            <div className={`flex items-center gap-1 flex-1 justify-center py-2 rounded-xl text-xs
                          font-semibold border ${
                            hasAvailableVariants
                              ? "border-green-200 bg-green-50 text-green-700"
                              : "border-red-200 bg-red-50 text-red-600"
                          }`}>
              {hasAvailableVariants ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              {item.variants?.length > 0 
                ? `${item.variants.filter(v => v.inStock !== false).length}/${item.variants.length} Available`
                : hasAvailableVariants ? "Available" : "Out of Stock"
              }
            </div>
            <button type="button" onClick={() => onToggleSpecial(item)} title="Toggle MNC Special feature"
              className={`p-2 rounded-xl border transition-colors ${item.isMncSpecial ? "bg-amber-500 text-white border-amber-500" : "bg-gray-50 text-gray-400 border-gray-200 hover:text-amber-500"}`}>
              <Sparkles size={15} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onEdit(item)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-medium hover:text-amber-600 hover:border-amber-300 hover:bg-amber-50 transition-colors">
              <Pencil size={13} /> Edit
            </button>
            <button type="button" onClick={() => onDelete(item.id)} disabled={isDeleting}
              className="p-2 rounded-xl border border-gray-200 text-gray-500
                         hover:text-red-600 hover:border-red-300 hover:bg-red-50
                         disabled:opacity-50 transition-colors">
              {isDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ItemStatusRow({ item, onStatusChange, isUpdating }) {
  const currentStatusIndex = ITEM_STATUSES.indexOf(item.status || "Pending");
  const nextStatus = ITEM_STATUSES[currentStatusIndex + 1];
  const statusMeta = STATUS_META[item.status || "Pending"];

  return (
    <div className="py-2 px-3 bg-white rounded-lg border border-gray-100">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div>
            <span className="text-sm font-medium text-gray-900">
              {item.qty}× {item.itemName}
            </span>
            {item.variantLabel && (
              <span className="text-xs text-gray-500 ml-1">({item.variantLabel})</span>
            )}
          </div>
          
          {/* COMPACT ADD-ONS SUB-TEXT */}
          {item.addons?.length > 0 && (
            <div className="mt-1">
              <span className="text-orange-600 font-bold text-sm">
                + {item.addons.map(addon => addon.label).join(' & ').toUpperCase()}
              </span>
              <span className="text-orange-500 text-xs ml-2">
                (+₹{item.addons.reduce((sum, addon) => sum + addon.price, 0)})
              </span>
            </div>
          )}
          
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusMeta.color}`}>
              {statusMeta.icon} {item.status || "Pending"}
            </span>
            <span className="text-xs text-gray-500">₹{item.price * item.qty}</span>
          </div>
        </div>
        {nextStatus && (
          <button
            type="button"
            onClick={() => onStatusChange(nextStatus)}
            disabled={isUpdating}
            className="flex items-center gap-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-60
                       text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            {isUpdating ? <Loader2 size={10} className="animate-spin" /> : <ChevronRight size={10} />}
            {nextStatus}
          </button>
        )}
      </div>
    </div>
  );
}

function OrderCard({ order, onStatusChange, onItemStatusChange, isUpdating }) {
  const meta = STATUS_META[order.status] ?? STATUS_META.Open;
  const [expandedItems, setExpandedItems] = useState(false);

  // ── Modification data (backward-compatible) ────────────────────────────────
  const modifications = order.modifications ?? [];
  const hasModification = order.hasModification && modifications.length > 0;

  // Flatten all newly-added items for the badge summary (last batch only)
  const lastMod = modifications.length > 0 ? modifications[modifications.length - 1] : null;
  const lastModItems = lastMod?.items ?? [];

  // Running total = base totalPrice (already incremented via Firestore increment)
  const runningTotal = order.totalPrice ?? 0;

  // Helper to get all items with their statuses (original + modifications)
  const getAllItems = () => {
    const originalItems = (order.items ?? []).map(item => ({
      ...item,
      source: 'original',
      id: `original-${item.itemId}-${item.variantLabel}`,
    }));
    
    const modificationItems = modifications.flatMap((mod, modIndex) => 
      (mod.items ?? []).map((item, itemIndex) => ({
        ...item,
        source: 'modification',
        modIndex,
        id: `mod-${modIndex}-${itemIndex}`,
      }))
    );
    
    return [...originalItems, ...modificationItems];
  };

  const allItems = getAllItems();
  const pendingItems = allItems.filter(item => item.status === 'Pending');
  const preparingItems = allItems.filter(item => item.status === 'Preparing'); 
  const readyItems = allItems.filter(item => item.status === 'Ready');

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      className={`rounded-2xl border shadow-sm overflow-hidden
                  ${order.status === "Completed"
                    ? "bg-gray-50/70 border-gray-200 opacity-80"
                    : "bg-white border-gray-200"}`}
    >
      {/* ── Professional Modification Alert Banner ── */}
      {hasModification && order.status !== "Completed" && (
        <div className="flex items-center gap-3 px-4 py-3
                        bg-gradient-to-r from-amber-50 to-orange-50 
                        border-l-4 border-amber-500 border-b border-amber-200">
          <div className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-sm">+</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-amber-800 text-sm font-bold leading-tight">
              Customer Added Items
            </p>
            <p className="text-amber-700 text-xs mt-0.5 leading-snug">
              {lastModItems.map((it, i) => (
                <span key={i}>
                  {i > 0 && " • "}
                  <strong className="text-amber-900">{it.itemName}</strong> ×{it.qty}
                  {it.addons?.length > 0 && (
                    <span className="text-orange-600 ml-1">
                      (+{it.addons.length} extra{it.addons.length > 1 ? 's' : ''})
                    </span>
                  )}
                </span>
              ))}
              {modifications.length > 1 && (
                <span className="text-amber-600 ml-2 font-medium">
                  +{modifications.length - 1} more batch{modifications.length > 2 ? "es" : ""}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex-shrink-0 text-xs font-bold text-amber-800
                             bg-amber-200 border border-amber-400 px-3 py-1 rounded-full
                             whitespace-nowrap">
              New Items
            </span>
          </div>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-gray-900">
                Table {order.tableNumber ?? "—"}
              </span>
              {order.customerPhone && (
                <span className="text-xs text-gray-600">· {order.customerPhone}</span>
              )}
              {order.isStreakOrder && (
                <span className="text-[10px] font-black bg-amber-400 text-amber-950
                                 px-2 py-0.5 rounded-md leading-tight whitespace-nowrap">
                  🎁 STREAK #7
                </span>
              )}
            </div>
            <span className="text-xs text-gray-600">{timeAgo(order.createdAt)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1
                              rounded-full border ${meta.color}`}>
              {meta.icon}{order.status}
            </span>
          </div>
        </div>

        {/* Kitchen Status Summary */}
        {order.status === "Open" && (
          <div className="mb-3 p-3 bg-gray-50 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Kitchen Status</span>
              <button 
                onClick={() => setExpandedItems(!expandedItems)}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                {expandedItems ? 'Collapse' : 'Expand'}
                <ChevronDown size={12} className={`transition-transform ${expandedItems ? 'rotate-180' : ''}`} />
              </button>
            </div>
            <div className="flex gap-3 text-xs">
              {pendingItems.length > 0 && (
                <span className="flex items-center gap-1 text-yellow-600">
                  <Clock size={10} /> {pendingItems.length} Pending
                </span>
              )}
              {preparingItems.length > 0 && (
                <span className="flex items-center gap-1 text-blue-600">
                  <ChefHat size={10} /> {preparingItems.length} Preparing
                </span>
              )}
              {readyItems.length > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <CheckCircle2 size={10} /> {readyItems.length} Ready
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Detailed item view (expandable) ── */}
        {expandedItems && order.status === "Open" && (
          <div className="mb-3 space-y-3">
            {/* Original items */}
            <div>
              <p className="text-xs font-bold text-gray-600 mb-2">Original Order</p>
              <div className="space-y-2">
                {(order.items ?? []).map((item, i) => (
                  <ItemStatusRow 
                    key={`original-${i}`} 
                    item={item} 
                    onStatusChange={(newStatus) => onItemStatusChange(order.id, 'original', i, newStatus)}
                    isUpdating={isUpdating}
                  />
                ))}
              </div>
            </div>

            {/* Modification batches */}
            {modifications.map((mod, modIndex) => (
              <div key={modIndex}>
                <p className="text-xs font-bold text-amber-600 mb-2">
                  Added Items - Batch {modIndex + 1}
                  {mod.addedAt && (
                    <span className="font-normal text-gray-500 ml-1">
                      ({mod.addedAt.toDate 
                        ? mod.addedAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : new Date(mod.addedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
                    </span>
                  )}
                </p>
                <div className="space-y-2">
                  {(mod.items ?? []).map((item, itemIndex) => (
                    <ItemStatusRow 
                      key={`mod-${modIndex}-${itemIndex}`} 
                      item={item} 
                      onStatusChange={(newStatus) => onItemStatusChange(order.id, 'modification', modIndex, newStatus, itemIndex)}
                      isUpdating={isUpdating}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Professional Order Layout — Ticket Style ── */}
        {!expandedItems && (
          <div className="space-y-4">
            {/* ORIGINAL ORDER ITEMS */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Original Order</span>
                <div className="flex-1 h-px bg-gray-200"></div>
              </div>
              
              <div className="space-y-3">
                {order.items?.map((it, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-4 border-l-4 border-gray-300">
                    {/* Main item info */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="bg-gray-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                            {it.qty}×
                          </span>
                          <span className="text-gray-900 font-semibold text-base">
                            {it.itemName}
                          </span>
                          {it.variantLabel && (
                            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full border">
                              {it.variantLabel}
                            </span>
                          )}
                        </div>
                        
                        {/* COMPACT ADD-ONS SUB-TEXT */}
                        {it.addons?.length > 0 && (
                          <div className="mt-1 ml-6">
                            <span className="text-orange-600 font-bold text-xs">
                              + {it.addons.map(addon => addon.label).join(' & ').toUpperCase()}
                            </span>
                            <span className="text-orange-500 text-xs ml-2">
                              (+₹{it.addons.reduce((sum, addon) => sum + addon.price, 0)})
                            </span>
                          </div>
                        )}
                        
                     
                      </div>
                      
                      <div className="text-right">
                        <span className={`text-lg font-bold ${it.isFreeStreak ? "text-green-600" : "text-gray-700"}`}>
                          {it.isFreeStreak ? "FREE" : `₹${it.price * it.qty}`}
                        </span>
                        {it.isFreeStreak && (
                          <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full mt-1">
                            🎁 STREAK REWARD
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CUSTOMER ADDED ITEMS */}
            {modifications.map((mod, mi) => (
              <div key={mi}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                    Customer Added - Batch {mi + 1}
                  </span>
                  <div className="flex-1 h-px bg-amber-200"></div>
                  <span className="text-xs text-amber-600 font-medium">
                    {mod.addedAt ? (mod.addedAt.toDate ? mod.addedAt.toDate() : new Date(mod.addedAt)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ''}
                  </span>
                </div>
                
                <div className="space-y-3">
                  {(mod.items ?? []).map((it, i) => (
                    <div key={i} className="bg-amber-50 rounded-lg p-4 border-l-4 border-amber-500">
                      {/* Main item info */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="bg-amber-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                              {it.qty}×
                            </span>
                            <span className="text-amber-900 font-semibold text-base">
                              {it.itemName}
                            </span>
                            {it.variantLabel && (
                              <span className="bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full border border-amber-300">
                                {it.variantLabel}
                              </span>
                            )}
                          </div>
                          
                          {/* COMPACT ADD-ONS SUB-TEXT FOR CUSTOMER ADDED ITEMS */}
                          {it.addons?.length > 0 && (
                            <div className="mt-1 ml-6">
                              <span className="text-red-600 font-bold text-sm">
                                + {it.addons.map(addon => addon.label).join(' & ').toUpperCase()}
                              </span>
                              <span className="text-red-500 text-xs ml-2">
                                (+₹{it.addons.reduce((sum, addon) => sum + addon.price, 0)})
                              </span>
                            </div>
                          )}
                          
                          {/* Status indicator for Open orders */}
                          {order.status === "Open" && it.status && (
                            <div className="mt-2">
                              <span className={`text-xs px-2 py-1 rounded-full border font-medium ${STATUS_META[it.status]?.color || STATUS_META.Pending.color}`}>
                                {STATUS_META[it.status]?.icon} {it.status}
                              </span>
                            </div>
                          )}
                        </div>
                        
                        <span className="text-amber-800 text-lg font-bold">
                          ₹{it.price * it.qty}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Batch note */}
                {mod.note && (
                  <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-blue-800 text-sm italic">
                      <span className="font-semibold">Note:</span> "{mod.note}"
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-gray-100">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-xs text-gray-600 font-medium truncate">{order.paymentMethod}</span>
            <span className="text-sm font-bold text-gray-900 flex-shrink-0">₹{runningTotal}</span>
            {hasModification && (
              <span className="text-[10px] font-semibold text-amber-600 flex-shrink-0">
                (incl. add-ons)
              </span>
            )}
          </div>
          {order.status === "Open" ? (
            <button
              type="button"
              onClick={() => onStatusChange(order.id, "Completed")}
              disabled={isUpdating}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700
                         disabled:opacity-60 text-white text-xs font-semibold
                         px-4 py-2.5 rounded-lg transition-colors
                         min-h-[44px] active:scale-95 flex-shrink-0 ml-auto"
            >
              {isUpdating
                ? <Loader2 size={12} className="animate-spin" />
                : <CircleDollarSign size={12} />}
              Complete & Pay
            </button>
          ) : (
            <span className="text-xs text-green-700 font-bold flex items-center gap-1 flex-shrink-0 ml-auto">
              <CheckCircle2 size={13} /> Completed
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main AdminMenu ─────────────────────────────────────────────────────────────

export default function AdminMenu() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("menu");

  // Menu state
  const [items,          setItems]          = useState([]);
  const [form,           setForm]           = useState({ ...EMPTY_FORM });
  const [editingId,      setEditingId]      = useState(null);
  const [showForm,       setShowForm]       = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [deletingId,     setDeletingId]     = useState(null);
  const [togglingId,     setTogglingId]     = useState(null);
  const [errors,         setErrors]         = useState({});
  const [filterCategory, setFilterCategory] = useState("All");
  const [searchQuery]    = useState("");
  const [imgError,       setImgError]       = useState(false);
  const [uploading,      setUploading]      = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl,     setPreviewUrl]     = useState(null);
  const fileInputRef = useRef(null);

  // Orders state & Crowd Management Sub-Filter (Active vs Completed)
  const [orders,          setOrders]          = useState([]);
  const [ordersLoading,   setOrdersLoading]   = useState(true);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [orderSubView,    setOrderSubView]    = useState("active"); // "active" or "history"

  const formTopRef = useRef(null);
  const initialLoadRef = useRef(true);

  // Prevent browser back navigation from leaving admin panel
  useEffect(() => {
    const handlePopState = (event) => {
      event.preventDefault();
      if (window.confirm("Are you sure you want to leave the admin panel? You will need to log in again.")) {
        logout().then(() => {
          navigate("/admin/login", { replace: true });
        });
      } else {
        // Push the current state back to prevent navigation
        window.history.pushState(null, "", window.location.href);
      }
    };

    // Add current state to history to intercept back navigation
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [logout, navigate]);

  // Firestore Menu Listener
  useEffect(() => {
    return onSnapshot(collection(db, "menu_items"), (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  // Firestore Orders Listener with Audio Notification
  useEffect(() => {
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      const fetchedOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (!initialLoadRef.current) {
        snap.docChanges().forEach((change) => {
          if (change.type === "added") {
            const newOrder = change.doc.data();
            if (newOrder.status === "Open") {
              // Play single loud alert for new orders
              resumeAudioCtx();
              playOrderChime();
            }
          }
          // Play distinct alert when a customer adds items to an existing order
          if (change.type === "modified") {
            const updatedOrder = change.doc.data();
            if (updatedOrder.hasModification) {
              resumeAudioCtx();
              playModificationChime();
            }
          }
        });
      } else {
        initialLoadRef.current = false;
      }

      setOrders(fetchedOrders);
      setOrdersLoading(false);
    });
  }, []);

  useEffect(() => {
    if (showForm) {
      setTimeout(() => formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
  }, [showForm]);

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login", { replace: true });
  };

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Item name is required.";
    const filled = form.variants.filter((v) => v.label.trim() !== "" && v.price !== "");
    if (filled.length === 0) e.variants = "At least one price variant is required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      // imageUrl now contains either a URL string or Base64 data - both work directly
      const data = sanitizeItem(form);
      
      if (editingId) {
        await updateDoc(doc(db, "menu_items", editingId), { ...data, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, "menu_items"), { ...data, createdAt: serverTimestamp() });
      }
      setSaving(false);
      resetForm();
    } catch (err) {
      console.error("Save failed:", err);
      setSaving(false);
      setErrors((p) => ({ ...p, submit: err.message || "Failed to save. Check connection and try again." }));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this item? This cannot be undone.")) return;
    setDeletingId(id);
    try { await deleteDoc(doc(db, "menu_items", id)); }
    catch (err) { console.error(err); }
    finally { setDeletingId(null); }
  };

  // File upload handler - Client-side compression to Base64
  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setImgError(true);
      setErrors((p) => ({ ...p, imageUrl: "Please select a valid image file." }));
      return;
    }

    // Validate file size (10MB limit before compression)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image file must be smaller than 10MB');
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(25);
      
      // Compress image to Base64
      let compressedBase64 = await compressImage(file, 800, 600, 0.8);
      setUploadProgress(75);
      
      // Check if compressed image fits Firestore limit
      if (!validateImageSize(compressedBase64, 800)) {
        // Try more aggressive compression
        compressedBase64 = await compressImage(file, 600, 400, 0.6);
        
        if (!validateImageSize(compressedBase64, 800)) {
          throw new Error("Image too large even after compression. Please use a smaller image.");
        }
      }
      
      setUploadProgress(100);
      
      // Store compressed Base64 in form
      setField("imageUrl", compressedBase64);
      setField("imageFile", null); // Clear file when Base64 is set
      setPreviewUrl(compressedBase64);
      setImgError(false);
      setErrors((p) => ({ ...p, imageUrl: "" }));
      
    } catch (error) {
      console.error('Image compression failed:', error);
      setImgError(true);
      setErrors((p) => ({ ...p, imageUrl: error.message || "Failed to process image." }));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // No longer need uploadImageToFirebase since we're using Base64
  
  const clearImageSelection = () => {
    setField("imageFile", null);
    setField("imageUrl", "");
    setPreviewUrl(null);
    setImgError(false);
    setErrors((p) => ({ ...p, imageUrl: "" }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Legacy function kept for compatibility (now using variant-level stock)
  // eslint-disable-next-line no-unused-vars
  const handleToggleStock = async (item) => {
    setTogglingId(item.id);
    try {
      await updateDoc(doc(db, "menu_items", item.id), {
        inStock: !item.inStock, updatedAt: serverTimestamp(),
      });
    } catch (err) { console.error(err); }
    finally { setTogglingId(null); }
  };

  // Variant-level stock toggle handler
  const handleToggleVariantStock = async (itemId, variantIndex, newStockStatus) => {
    setTogglingId(itemId);
    try {
      // Get current item to update specific variant
      const itemDoc = await getDoc(doc(db, "menu_items", itemId));
      if (itemDoc.exists()) {
        const currentItem = itemDoc.data();
        const updatedVariants = [...(currentItem.variants || [])];
        
        // Update specific variant's stock status
        if (updatedVariants[variantIndex]) {
          updatedVariants[variantIndex].inStock = newStockStatus;
        }
        
        await updateDoc(doc(db, "menu_items", itemId), {
          variants: updatedVariants,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) { 
      console.error('Failed to update variant stock:', err); 
    } finally { 
      setTogglingId(null); 
    }
  };

  // MNC Special toggle handler for admin menu cards
  const handleToggleSpecial = async (item) => {
    try {
      await updateDoc(doc(db, "menu_items", item.id), {
        isMncSpecial: !item.isMncSpecial, updatedAt: serverTimestamp(),
      });
    } catch (err) { console.error(err); }
  };

  const handleEdit = (item) => {
    setForm({
      name: item.name || "", category: item.category || CATEGORIES[0],
      description: item.description || "", imageUrl: item.imageUrl || "",
      imageFile: null, // Always null when editing existing item
      variants: item.variants?.length
        ? item.variants.map((v) => ({ 
            label: v.label, 
            price: String(v.price),
            inStock: v.inStock !== false // Default to true for existing variants without inStock
          }))
        : [{ label: "", price: "", inStock: true }],
      addons: item.addons?.length
        ? item.addons.map((a) => ({ label: a.label, price: String(a.price) }))
        : [{ label: "", price: "" }],
      inStock: item.inStock ?? true,
      isMncSpecial: item.isMncSpecial ?? false,
    });
    setEditingId(item.id);
    setErrors({});
    setImgError(false);
    setShowForm(true);
    clearImageSelection(); // Clear any previous file selection
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setErrors({});
    setImgError(false);
    setSaving(false);
    setShowForm(false);
    clearImageSelection();
  };

  const handleOpenAdd = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setErrors({});
    setShowForm(true);
    clearImageSelection();
  };

  const handleOrderStatus = async (orderId, newStatus) => {
    setUpdatingOrderId(orderId);
    try {
      await updateDoc(doc(db, "orders", orderId), {
        status: newStatus, updatedAt: serverTimestamp(),
      });
    } catch (err) { console.error(err); }
    finally { setUpdatingOrderId(null); }
  };

  const handleItemStatusChange = async (orderId, source, index, newStatus, subIndex = null) => {
    setUpdatingOrderId(orderId);
    try {
      const orderRef = doc(db, "orders", orderId);
      const orderDoc = await getDoc(orderRef);
      
      if (!orderDoc.exists()) return;
      
      const orderData = orderDoc.data();
      
      if (source === 'original') {
        // Update original item status
        const updatedItems = [...(orderData.items || [])];
        if (updatedItems[index]) {
          updatedItems[index] = { ...updatedItems[index], status: newStatus };
          await updateDoc(orderRef, {
            items: updatedItems,
            updatedAt: serverTimestamp(),
          });
        }
      } else if (source === 'modification') {
        // Update modification item status
        const updatedModifications = [...(orderData.modifications || [])];
        if (updatedModifications[index] && updatedModifications[index].items) {
          const updatedModItems = [...updatedModifications[index].items];
          if (updatedModItems[subIndex]) {
            updatedModItems[subIndex] = { ...updatedModItems[subIndex], status: newStatus };
            updatedModifications[index] = {
              ...updatedModifications[index],
              items: updatedModItems
            };
            await updateDoc(orderRef, {
              modifications: updatedModifications,
              updatedAt: serverTimestamp(),
            });
          }
        }
      }
    } catch (err) { 
      console.error('Item status update failed:', err); 
    } finally { 
      setUpdatingOrderId(null); 
    }
  };

  const categoryCounts = items.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  const filteredItems = items.filter((item) => {
    const matchCat = filterCategory === "All" || item.category === filterCategory;
    const q = searchQuery.toLowerCase();
    return matchCat && (!q || item.name?.toLowerCase().includes(q) || item.category?.toLowerCase().includes(q));
  });

  // Crowd Management Filter: Open Orders vs Completed History
  const activeOrders = orders.filter((o) => o.status === "Open");
  const historyOrders = orders.filter((o) => o.status === "Completed");
  const displayedOrders = orderSubView === "active" ? activeOrders : historyOrders;

  const openCount = orders.filter((o) => o.status === "Open").length;

  return (
    <div className="min-h-screen bg-gray-50" onClick={resumeAudioCtx}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.preventDefault();
                if (window.confirm("Are you sure you want to leave the admin panel? You will need to log in again.")) {
                  handleLogout();
                }
              }}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Exit admin panel">
              <ArrowLeft size={18} />
            </button>
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center">
              <UtensilsCrossed size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight">Admin Panel</h1>
              <p className="text-xs text-gray-500 truncate max-w-[180px]">
                {currentUser?.email ?? "Mid Night Coffee"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === "menu" && !showForm && (
              <button type="button" onClick={handleOpenAdd}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white
                           text-sm font-semibold px-4 py-2 rounded-xl shadow transition-colors">
                <Plus size={15} />Add Item
              </button>
            )}
            <button type="button" onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-500
                         hover:text-red-600 border border-gray-200 hover:border-red-300
                         px-3 py-2 rounded-xl transition-colors">
              <LogOut size={15} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-t border-gray-100 px-4 pb-safe">
          <div className="flex gap-1 max-w-6xl mx-auto">
            {[
              { id: "menu",   label: "Menu Items",  icon: <LayoutGrid size={14} /> },
              { id: "orders", label: "Live Orders", icon: <ClipboardList size={14} />,
                badge: openCount > 0 ? openCount : null },
            ].map((tab) => (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-4 py-3 text-sm font-semibold
                            border-b-2 transition-colors min-h-[48px]
                            ${activeTab === tab.id
                              ? "border-amber-500 text-amber-600"
                              : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {tab.icon}{tab.label}
                {tab.badge && (
                  <span className="ml-1 w-5 h-5 bg-red-500 text-white text-xs font-bold
                                   rounded-full flex items-center justify-center animate-pulse">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* MENU TAB */}
        {activeTab === "menu" && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Items"  value={items.length}                           colorClasses="bg-blue-50  text-blue-700  border-blue-100"  />
              <StatCard label="In Stock"     value={items.filter((i) => i.inStock).length}  colorClasses="bg-green-50 text-green-700 border-green-100" />
              <StatCard label="MNC Special"  value={items.filter((i) => i.isMncSpecial).length} colorClasses="bg-amber-50 text-amber-700 border-amber-100" />
              <StatCard label="Categories"   value={Object.keys(categoryCounts).length}     colorClasses="bg-purple-50 text-purple-700 border-purple-100" />
            </div>
            <AnimatePresence>
              {showForm && (
                <motion.div ref={formTopRef} key="admin-form"
                  initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}
                  className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-amber-50">
                    <h2 className="text-base font-semibold text-gray-800">
                      {editingId ? "✏️ Edit Menu Item" : "➕ New Menu Item"}
                    </h2>
                    <button type="button" onClick={resetForm}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                      <X size={18} />
                    </button>
                  </div>

                  <form onSubmit={handleSave} noValidate className="p-6 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Item Name <span className="text-red-500">*</span>
                        </label>
                        <input type="text" value={form.name}
                          onChange={(e) => setField("name", e.target.value)}
                          placeholder="e.g. Classic Cold Coffee"
                          className={`w-full border rounded-lg px-3 py-2.5 text-sm bg-white text-gray-900
                                      focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent
                                      ${errors.name ? "border-red-400 bg-red-50" : "border-gray-300"}`} />
                        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Category <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <select value={form.category} onChange={(e) => setField("category", e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-9 text-sm
                                       bg-white text-gray-900 appearance-none
                                       focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent">
                            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <ChevronDown size={15} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <textarea rows={2} value={form.description}
                        onChange={(e) => setField("description", e.target.value)}
                        placeholder="Short description of the item..."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white
                                   text-gray-900 resize-none
                                   focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Item Image</label>
                      <p className="text-xs text-gray-400 mb-3">Upload an image file or paste a URL. Images are compressed to Base64 automatically.</p>
                      
                      {/* Upload Methods Toggle */}
                      <div className="flex gap-2 mb-4">
                        <div className="flex-1">
                          <label className="block">
                            <div className="cursor-pointer border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-amber-400 transition-colors">
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFileSelect}
                                className="hidden"
                              />
                              <Upload size={24} className="mx-auto text-gray-400 mb-2" />
                              <p className="text-sm font-medium text-gray-600">Upload & Compress</p>
                              <p className="text-xs text-gray-400 mt-1">Auto-compressed to Base64</p>
                            </div>
                          </label>
                        </div>
                        <div className="flex items-center text-gray-400 text-sm font-medium">OR</div>
                        <div className="flex-1">
                          <div className="relative">
                            <ImageIcon size={15}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            <input 
                              type="url" 
                              value={form.imageUrl.startsWith('data:') ? '' : form.imageUrl}
                              onChange={(e) => { 
                                setImgError(false); 
                                setField("imageUrl", e.target.value);
                                if (e.target.value) {
                                  setField("imageFile", null);
                                  setPreviewUrl(null);
                                  if (fileInputRef.current) {
                                    fileInputRef.current.value = '';
                                  }
                                }
                              }}
                              placeholder="https://images.unsplash.com/photo-..."
                              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 text-sm
                                         bg-white text-gray-900
                                         focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
                          </div>
                          <p className="text-xs text-gray-400 mt-1">Paste image URL</p>
                        </div>
                      </div>

                      {/* Upload Progress */}
                      {uploading && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                            <span>Compressing image...</span>
                            <span>{uploadProgress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-amber-500 h-2 rounded-full transition-all duration-300" 
                              style={{ width: `${uploadProgress}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      {/* Image Preview */}
                      {(previewUrl || (form.imageUrl && !imgError)) && (
                        <div className="mt-3 relative inline-block">
                          <img 
                            src={previewUrl || form.imageUrl} 
                            alt="preview"
                            className="h-32 w-auto object-cover rounded-xl border border-gray-200 shadow-sm"
                            onError={() => setImgError(true)} 
                          />
                          <button 
                            type="button"
                            onClick={clearImageSelection}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white
                                       rounded-full flex items-center justify-center shadow hover:bg-red-600 transition-colors">
                            <X size={12} />
                          </button>
                          <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                            {form.imageUrl.startsWith('data:') ? '📦 Base64' : '🔗 URL'}
                          </div>
                        </div>
                      )}

                      {/* Error State */}
                      {((form.imageUrl && imgError) || errors.imageUrl) && (
                        <p className="text-xs text-red-500 mt-1.5">
                          ⚠ {errors.imageUrl || "Could not load this image."}
                        </p>
                      )}

                      {/* Quick Samples - only show if no image selected */}
                      {!previewUrl && !form.imageUrl && (
                        <div className="mt-3">
                          <p className="text-xs text-gray-400 mb-1.5">Quick samples:</p>
                          <div className="flex flex-wrap gap-2">
                            {SAMPLE_IMAGES.map((s) => (
                              <button key={s.label} type="button"
                                onClick={() => { 
                                  setImgError(false); 
                                  setField("imageUrl", s.url);
                                  clearImageSelection();
                                }}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors
                                           bg-white text-gray-600 border-gray-300 hover:border-amber-400 hover:text-amber-600">
                                <img src={s.url} alt={s.label} className="w-4 h-4 rounded object-cover" />
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Price Variants <span className="text-red-500">*</span>
                      </label>
                      <DynamicPairList items={form.variants} onChange={(v) => setField("variants", v)} addLabel="Add Variant" isVariant={true} />
                      {errors.variants && <p className="text-red-500 text-xs mt-1">{errors.variants}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Add-on Options</label>
                      <DynamicPairList items={form.addons} onChange={(a) => setField("addons", a)} addLabel="Add Add-on" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <div>
                          <p className="text-sm font-medium text-gray-700">Availability</p>
                          <p className="text-xs text-gray-400 mt-0.5">Toggle whether this item can be ordered</p>
                        </div>
                        <button type="button" onClick={() => setField("inStock", !form.inStock)}
                          className="flex items-center gap-2 focus:outline-none">
                          {form.inStock ? (
                            <><span className="text-sm font-semibold text-green-600">In Stock</span>
                              <ToggleRight size={32} className="text-green-500" /></>
                          ) : (
                            <><span className="text-sm font-semibold text-red-500">Out of Stock</span>
                              <ToggleLeft size={32} className="text-gray-400" /></>
                          )}
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <div>
                          <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                            <Sparkles size={14} className="text-amber-500" /> MNC Special
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">Feature in home MNC Special view</p>
                        </div>
                        <button type="button" onClick={() => setField("isMncSpecial", !form.isMncSpecial)}
                          className="flex items-center gap-2 focus:outline-none">
                          {form.isMncSpecial ? (
                            <><span className="text-sm font-semibold text-amber-600">Featured</span>
                              <ToggleRight size={32} className="text-amber-500" /></>
                          ) : (
                            <><span className="text-sm font-semibold text-gray-400">Normal</span>
                              <ToggleLeft size={32} className="text-gray-400" /></>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                      <button type="button" onClick={resetForm}
                        className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-600 text-sm font-semibold hover:bg-gray-50">
                        Cancel
                      </button>
                      <button type="submit" disabled={saving || uploading}
                        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl shadow transition-colors disabled:opacity-50">
                        {(saving || uploading) ? (
                          <><Loader2 size={16} className="animate-spin" /> {uploading ? "Compressing..." : "Saving..."}</>
                        ) : "Save Item"}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Menu Filters */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="w-full sm:w-auto flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                {["All", ...CATEGORIES].map((c) => (
                  <button key={c} type="button" onClick={() => setFilterCategory(c)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors border
                                ${filterCategory === c
                                  ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-amber-300"}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid display */}
            {filteredItems.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                <PackageX size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600 font-semibold text-base">No items found</p>
                <p className="text-gray-400 text-xs mt-1">Try changing category filter or add a new menu item.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence>
                  {filteredItems.map((item) => (
                    <MenuItemCard key={item.id} item={item} onEdit={handleEdit} onDelete={handleDelete}
                      onToggleVariantStock={handleToggleVariantStock} onToggleSpecial={handleToggleSpecial}
                      isDeleting={deletingId === item.id} isToggling={togglingId === item.id} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </>
        )}

        {/* ORDERS TAB — Crowd Management (Active vs History) */}
        {activeTab === "orders" && (
          <>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-1">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setOrderSubView("active")}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors border
                              ${orderSubView === "active"
                                ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                                : "bg-white text-gray-600 border-gray-200 hover:border-amber-300"}`}>
                  <Clock size={13} /> Open Orders ({activeOrders.length})
                </button>
                <button type="button" onClick={() => setOrderSubView("history")}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors border
                              ${orderSubView === "history"
                                ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                                : "bg-white text-gray-600 border-gray-200 hover:border-amber-300"}`}>
                  <Archive size={13} /> Completed History ({historyOrders.length})
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { 
                  resumeAudioCtx(); 
                  playOrderChime(); 
                }} title="Test New Order Sound - Single Play"
                  className="flex items-center gap-1 text-xs text-blue-700 bg-blue-100 border border-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-200 font-medium">
                  <Volume2 size={13} /> Test New Order Sound
                </button>
                <button type="button" onClick={() => { 
                  resumeAudioCtx(); 
                  playModificationChime(); 
                }} title="Test Item Addition Sound - Single Play"
                  className="flex items-center gap-1 text-xs text-orange-700 bg-orange-100 border border-orange-300 px-3 py-1.5 rounded-lg hover:bg-orange-200 font-medium">
                  <Volume2 size={13} /> Test Addition Sound
                </button>
              </div>
            </div>

            {ordersLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Loader2 size2={32} className="animate-spin text-amber-500 mb-3" />
                <p className="text-sm">Loading Live Orders…</p>
              </div>
            ) : displayedOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                <ClipboardList size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600 font-semibold text-base">
                  {orderSubView === "active" ? "No open orders right now!" : "No completed orders history."}
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  {orderSubView === "active" ? "Incoming customer orders will appear here automatically." : "Completed orders will be archived here."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence>
                  {displayedOrders.map((order) => (
                    <OrderCard key={order.id} order={order} onStatusChange={handleOrderStatus}
                      onItemStatusChange={handleItemStatusChange}
                      isUpdating={updatingOrderId === order.id} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}