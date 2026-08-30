import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, query, orderBy,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import {
  Plus, Trash2, Pencil, X, Check,
  ToggleLeft, ToggleRight, ImageIcon, ChevronDown,
  Loader2, PackageX, UtensilsCrossed, ArrowLeft,
  LogOut, ClipboardList, LayoutGrid, Clock,
  CheckCircle2, ChefHat, CircleDollarSign, Volume2, Sparkles, Archive
} from "lucide-react";

// ─── Constants ─────────────────────────────────────────────────────────────────

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
  variants: [{ label: "", price: "" }],
  addons:   [{ label: "", price: "" }],
  inStock: true,
  isMncSpecial: false,
};

const ORDER_STATUSES = ["Pending", "Preparing", "Ready", "Completed"];

const STATUS_META = {
  Pending:   { color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", icon: <Clock size={13} /> },
  Preparing: { color: "bg-blue-500/15 text-blue-400 border-blue-500/30",       icon: <ChefHat size={13} /> },
  Ready:     { color: "bg-amber-500/15 text-amber-400 border-amber-500/30",    icon: <CheckCircle2 size={13} /> },
  Completed: { color: "bg-green-500/15 text-green-400 border-green-500/30",    icon: <CircleDollarSign size={13} /> },
};

// ─── Web Audio API Notification Helper ─────────────────────────────────────────

function playOrderChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch (err) {
    console.error("Audio playback restriction:", err);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const sanitizeItem = (form) => ({
  name:         form.name.trim(),
  category:     form.category,
  description:  form.description.trim(),
  imageUrl:     form.imageUrl.trim(),
  variants: form.variants
    .filter((v) => v.label.trim() !== "" && v.price !== "")
    .map((v)    => ({ label: v.label.trim(), price: parseFloat(v.price) })),
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

function PairRow({ item, index, total, onUpdate, onRemove }) {
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

function DynamicPairList({ items, onChange, addLabel }) {
  const handleUpdate = (i, field, val) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, [field]: val } : it)));
  const handleRemove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const handleAdd    = ()  => onChange([...items, { label: "", price: "" }]);
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <PairRow key={i} item={item} index={i} total={items.length}
          onUpdate={handleUpdate} onRemove={handleRemove} />
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
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium opacity-75 mt-0.5">{label}</p>
    </div>
  );
}

function MenuItemCard({ item, onEdit, onDelete, onToggleStock, onToggleSpecial, isDeleting, isToggling }) {
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.18 }}
      className={`bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm flex flex-col
                  ${!item.inStock ? "opacity-60" : ""}`}
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
                           ${item.inStock ? "bg-green-500" : "bg-red-500"}`}>
            {item.inStock ? "In Stock" : "Out of Stock"}
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
        {item.variants?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.variants.map((v, i) => (
              <span key={i} className="bg-amber-50 border border-amber-200 text-amber-800
                                       text-xs font-medium px-2 py-0.5 rounded-full">
                {v.label} — ₹{v.price}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto pt-4 space-y-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onToggleStock(item)} disabled={isToggling}
              className={`flex items-center gap-1 flex-1 justify-center py-2 rounded-xl text-xs
                          font-semibold border transition-colors disabled:opacity-50
                          ${item.inStock
                            ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                            : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"}`}>
              {item.inStock ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              {item.inStock ? "In Stock" : "Out of Stock"}
            </button>
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

function OrderCard({ order, onStatusChange, isUpdating }) {
  const meta       = STATUS_META[order.status] ?? STATUS_META.Pending;
  const nextIdx    = ORDER_STATUSES.indexOf(order.status) + 1;
  const nextStatus = ORDER_STATUSES[nextIdx] ?? null;

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      className={`rounded-2xl border shadow-sm p-4 ${order.status === "Completed" ? "bg-gray-50/70 border-gray-200 opacity-80" : "bg-white border-gray-200"}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-gray-900">
              Table {order.tableNumber ?? "—"}
            </span>
            {order.customerPhone && (
              <span className="text-xs text-gray-400">· {order.customerPhone}</span>
            )}
            {order.isStreakOrder && (
              <span className="text-[10px] font-black bg-amber-400 text-amber-950
                               px-2 py-0.5 rounded-md leading-tight whitespace-nowrap">
                🎁 STREAK #7
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400">{timeAgo(order.createdAt)}</span>
        </div>
        <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1
                          rounded-full border ${meta.color}`}>
          {meta.icon}{order.status}
        </span>
      </div>

      <ul className="space-y-1.5 mb-3">
        {order.items?.map((it, i) => (
          <li key={i} className="flex justify-between text-sm gap-2">
            <span className="text-gray-700 flex items-center gap-1.5 flex-wrap">
              {it.qty}× {it.itemName}
              {it.variantLabel && (
                <span className="text-gray-400">({it.variantLabel})</span>
              )}
              {it.isFreeStreak && (
                <span className="inline-flex items-center gap-1 text-[10px] font-black
                                 bg-amber-400 text-amber-950 px-2 py-0.5 rounded-md
                                 leading-tight whitespace-nowrap">
                  🎁 FREE — STREAK REWARD #7
                </span>
              )}
            </span>
            <span className={`font-medium flex-shrink-0
                              ${it.isFreeStreak ? "text-green-600" : "text-gray-600"}`}>
              {it.isFreeStreak ? "FREE" : `₹${it.price * it.qty}`}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <div>
          <span className="text-xs text-gray-400">{order.paymentMethod}</span>
          <span className="ml-2 text-sm font-bold text-gray-900">₹{order.totalPrice}</span>
        </div>
        {nextStatus && order.status !== "Completed" ? (
          <button
            type="button"
            onClick={() => onStatusChange(order.id, nextStatus)}
            disabled={isUpdating}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600
                       disabled:opacity-60 text-white text-xs font-semibold
                       px-3 py-1.5 rounded-lg transition-colors"
          >
            {isUpdating
              ? <Loader2 size={12} className="animate-spin" />
              : <Check size={12} />}
            Mark {nextStatus}
          </button>
        ) : (
          <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
            <CheckCircle2 size={13} /> Completed
          </span>
        )}
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
  const [searchQuery,    setSearchQuery]    = useState("");
  const [imgError,       setImgError]       = useState(false);

  // Orders state & Crowd Management Sub-Filter (Active vs Completed)
  const [orders,          setOrders]          = useState([]);
  const [ordersLoading,   setOrdersLoading]   = useState(true);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [orderSubView,    setOrderSubView]    = useState("active"); // "active" or "history"

  const formTopRef = useRef(null);
  const initialLoadRef = useRef(true);

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
            if (newOrder.status === "Pending") {
              playOrderChime();
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
      setErrors((p) => ({ ...p, submit: "Failed to save. Check connection and try again." }));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this item? This cannot be undone.")) return;
    setDeletingId(id);
    try { await deleteDoc(doc(db, "menu_items", id)); }
    catch (err) { console.error(err); }
    finally { setDeletingId(null); }
  };

  const handleToggleStock = async (item) => {
    setTogglingId(item.id);
    try {
      await updateDoc(doc(db, "menu_items", item.id), {
        inStock: !item.inStock, updatedAt: serverTimestamp(),
      });
    } catch (err) { console.error(err); }
    finally { setTogglingId(null); }
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
      variants: item.variants?.length
        ? item.variants.map((v) => ({ label: v.label, price: String(v.price) }))
        : [{ label: "", price: "" }],
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
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setErrors({});
    setImgError(false);
    setSaving(false);
    setShowForm(false);
  };

  const handleOpenAdd = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setErrors({});
    setShowForm(true);
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

  const categoryCounts = items.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  const filteredItems = items.filter((item) => {
    const matchCat = filterCategory === "All" || item.category === filterCategory;
    const q = searchQuery.toLowerCase();
    return matchCat && (!q || item.name?.toLowerCase().includes(q) || item.category?.toLowerCase().includes(q));
  });

  // Crowd Management Filter: Active Orders vs Completed History
  const activeOrders = orders.filter((o) => o.status !== "Completed");
  const historyOrders = orders.filter((o) => o.status === "Completed");
  const displayedOrders = orderSubView === "active" ? activeOrders : historyOrders;

  const pendingCount = orders.filter((o) => o.status === "Pending").length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/"
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Back to home">
              <ArrowLeft size={18} />
            </Link>
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
        <div className="border-t border-gray-100 px-4">
          <div className="flex gap-1 max-w-6xl mx-auto">
            {[
              { id: "menu",   label: "Menu Items",  icon: <LayoutGrid size={14} /> },
              { id: "orders", label: "Live Orders", icon: <ClipboardList size={14} />,
                badge: pendingCount > 0 ? pendingCount : null },
            ].map((tab) => (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-4 py-3 text-sm font-semibold
                            border-b-2 transition-colors
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
                      <p className="text-xs text-gray-400 mb-2">Paste any direct image URL — previews instantly.</p>
                      <div className="relative">
                        <ImageIcon size={15}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <input type="url" value={form.imageUrl}
                          onChange={(e) => { setImgError(false); setField("imageUrl", e.target.value); }}
                          placeholder="https://images.unsplash.com/photo-…"
                          className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 text-sm
                                     bg-white text-gray-900
                                     focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
                      </div>
                      {form.imageUrl && !imgError && (
                        <div className="mt-3 relative inline-block">
                          <img src={form.imageUrl} alt="preview"
                            className="h-28 w-auto object-cover rounded-xl border border-gray-200 shadow-sm"
                            onError={() => setImgError(true)} />
                          <button type="button"
                            onClick={() => { setField("imageUrl", ""); setImgError(false); }}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white
                                       rounded-full flex items-center justify-center shadow hover:bg-red-600">
                            <X size={12} />
                          </button>
                        </div>
                      )}
                      {form.imageUrl && imgError &&
                        <p className="text-xs text-red-500 mt-1.5">⚠ Could not load this URL.</p>}
                      <div className="mt-3">
                        <p className="text-xs text-gray-400 mb-1.5">Quick samples:</p>
                        <div className="flex flex-wrap gap-2">
                          {SAMPLE_IMAGES.map((s) => (
                            <button key={s.label} type="button"
                              onClick={() => { setImgError(false); setField("imageUrl", s.url); }}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors
                                          ${form.imageUrl === s.url
                                            ? "bg-amber-500 text-white border-amber-500"
                                            : "bg-white text-gray-600 border-gray-300 hover:border-amber-400 hover:text-amber-600"}`}>
                              <img src={s.url} alt={s.label} className="w-4 h-4 rounded object-cover" />
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Price Variants <span className="text-red-500">*</span>
                      </label>
                      <DynamicPairList items={form.variants} onChange={(v) => setField("variants", v)} addLabel="Add Variant" />
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
                      <button type="submit" disabled={saving}
                        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl shadow transition-colors disabled:opacity-50">
                        {saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : "Save Item"}
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
                      onToggleStock={handleToggleStock} onToggleSpecial={handleToggleSpecial}
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
                  <Clock size={13} /> Active Orders ({activeOrders.length})
                </button>
                <button type="button" onClick={() => setOrderSubView("history")}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors border
                              ${orderSubView === "history"
                                ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                                : "bg-white text-gray-600 border-gray-200 hover:border-amber-300"}`}>
                  <Archive size={13} /> Completed History ({historyOrders.length})
                </button>
              </div>
              <button type="button" onClick={() => playOrderChime()} title="Test Notification Chime"
                className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl hover:bg-amber-100">
                <Volume2 size={13} /> Test Sound
              </button>
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
                  {orderSubView === "active" ? "No active orders right now!" : "No completed orders history."}
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