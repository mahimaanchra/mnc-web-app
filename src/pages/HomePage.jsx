import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  UtensilsCrossed, ShoppingBag, X,
  AtSign, MapPin, ChevronRight,
} from "lucide-react";

// ─── Table Selector Modal ──────────────────────────────────────────────────────

function TableSelector({ onSelect, onClose }) {
  return (
    <>
      <motion.div
        key="ts-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/90 backdrop-blur-sm"
      />
      <motion.div
        key="ts-modal"
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0,  scale: 1    }}
        exit={   { opacity: 0, y: 40, scale: 0.95 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4"
      >
        <div className="w-full max-w-xs rounded-3xl border border-amber-500/40 overflow-hidden"
             style={{ background: "#0a0a0a" }}>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4
                          border-b border-amber-500/15">
            <div>
              <p className="text-white font-bold text-sm tracking-wide">
                Select Your Table
              </p>
              <p className="text-amber-500/40 text-xs mt-0.5">
                Tap the number you're seated at
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl border border-amber-500/20
                         flex items-center justify-center
                         text-amber-500/50 hover:text-amber-400 transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* 2 × 5 grid */}
          <div className="grid grid-cols-5 gap-2 p-4">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <motion.button
                key={n}
                whileTap={{ scale: 0.85 }}
                onClick={() => onSelect(n)}
                className="aspect-square rounded-xl flex flex-col items-center justify-center
                           border border-amber-500/25 text-amber-200 font-bold text-base
                           hover:bg-amber-500 hover:border-amber-400 hover:text-black
                           transition-all duration-150"
                style={{ background: "rgba(245,158,11,0.07)" }}
              >
                {n}
                <span className="text-[7px] font-semibold opacity-40 mt-0.5 tracking-widest">
                  TBL
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>
    </>
  );
}

// ─── Thin gold divider ─────────────────────────────────────────────────────────

function GoldRule() {
  return (
    <div className="w-full h-px bg-gradient-to-r
                    from-transparent via-amber-500/50 to-transparent" />
  );
}

// ─── HomePage ──────────────────────────────────────────────────────────────────

export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Read ?table=N from URL (QR scan)
  const params      = new URLSearchParams(location.search);
  const urlTable    = params.get("table");
  const tableNumber = urlTable ? parseInt(urlTable, 10) : null;
  const hasTable    = Number.isInteger(tableNumber) && tableNumber >= 1 && tableNumber <= 10;

  if (hasTable) {
    localStorage.setItem("tableNumber", String(tableNumber));
    localStorage.setItem("orderMode", "dine-in");
  }

  const [showSelector, setShowSelector]     = useState(false);
  const [isSpecialIntent, setIsSpecialIntent] = useState(false);

  // ── Route helpers ──────────────────────────────────────────────────────────

  const goDineIn = () => {
    setIsSpecialIntent(false);
    if (hasTable) navigate(`/menu?mode=dine-in&table=${tableNumber}`);
    else setShowSelector(true);
  };

  const onTablePick = (n) => {
    localStorage.setItem("tableNumber", String(n));
    localStorage.setItem("orderMode", "dine-in");
    setShowSelector(false);

    if (isSpecialIntent) {
      navigate(`/menu?mode=dine-in&table=${n}&filter=special`);
    } else {
      navigate(`/menu?mode=dine-in&table=${n}`);
    }
  };

  const goTakeaway = () => {
    localStorage.removeItem("tableNumber");
    localStorage.setItem("orderMode", "takeaway");
    navigate("/menu?mode=takeaway");
  };

  const goSpecials = () => {
    const savedTable = localStorage.getItem("tableNumber");
    if (!savedTable && !hasTable) {
      setIsSpecialIntent(true);
      setShowSelector(true);
    } else {
      const activeTable = tableNumber || savedTable;
      navigate(`/menu?mode=dine-in&table=${activeTable}&filter=special`);
    }
  };

  const goMenu = () =>
    navigate(hasTable ? `/menu?mode=dine-in&table=${tableNumber}` : "/menu");

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex flex-col items-center overflow-x-hidden"
      style={{ background: "#000000" }}
    >
      {/* ── Single gold-border card — the entire page layout ── */}
      <div className="relative w-full max-w-sm mx-auto my-6 px-4">
        <div
          className="rounded-3xl border border-amber-500/35
                     shadow-[0_0_60px_rgba(245,158,11,0.06)]"
          style={{ background: "#000000" }}
        >
          {/* ── inner container ── */}
          <div className="px-6 pb-7 flex flex-col items-center">

            {/* ════════════════════════════════ 1. LOGO */}
            <motion.div
              className="mt-8 mb-1"
              initial={{ opacity: 0, scale: 0.84 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <img
                src="/mnc-logo.svg"
                alt="MNC Mid Night Coffee"
                draggable={false}
                className="w-48 h-48 object-contain"
              />
            </motion.div>

            {/* ════════════════════════════════ 2. BRAND TEXT & TABLE BADGE */}
            <motion.div
              className="text-center w-full mb-1"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.38 }}
            >
              <p
                className="font-cinzel text-[10px] tracking-[0.38em] font-bold uppercase mt-2 mb-3
                           text-amber-500/80"
              >
                COFFEE &nbsp;|&nbsp; CHAT &nbsp;|&nbsp; CONNECT
              </p>

              <GoldRule />

              {/* Table detection badge if scanned via QR */}
              <AnimatePresence>
                {hasTable && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="w-full flex items-center justify-center gap-2.5 mt-3
                               bg-amber-500/8 border border-amber-500/25
                               rounded-xl px-3.5 py-2.5"
                  >
                    <MapPin size={14} className="text-amber-400 flex-shrink-0" />
                    <p className="text-amber-300 text-xs font-semibold">
                      Seated at Table {tableNumber}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* ════════════════════════════════ 3. ORDER TYPE CARDS */}
            <motion.div
              className="w-full mt-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.26, duration: 0.36 }}
            >
              <p className="text-[9px] font-bold tracking-[0.3em] text-amber-500/40
                            uppercase mb-3 text-center font-cinzel">
                How would you like to order?
              </p>

              <div className="grid grid-cols-2 gap-3">

                {/* Dine-In */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={goDineIn}
                  className="group flex flex-col items-start gap-2.5 p-4 rounded-2xl
                             text-left border border-amber-500/30
                             hover:border-amber-400/60 transition-colors duration-200"
                  style={{ background: "rgba(245,158,11,0.04)" }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center
                               border border-amber-500/30 group-hover:border-amber-400/50
                               transition-colors"
                    style={{ background: "rgba(245,158,11,0.10)" }}
                  >
                    <UtensilsCrossed size={17} className="text-amber-400" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm leading-tight font-cinzel">Dine-In</p>
                    <p className="text-amber-500/45 text-[10px] mt-0.5">
                      {hasTable ? `Table ${tableNumber} ✓` : "Select a table"}
                    </p>
                  </div>
                </motion.button>

                {/* Takeaway */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={goTakeaway}
                  className="group flex flex-col items-start gap-2.5 p-4 rounded-2xl
                             text-left border border-amber-500/15
                             hover:border-amber-500/35 transition-colors duration-200"
                  style={{ background: "rgba(245,158,11,0.02)" }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center
                               border border-amber-500/15 group-hover:border-amber-500/30
                               transition-colors"
                    style={{ background: "rgba(255,255,255,0.04)" }}
                  >
                    <ShoppingBag size={17} className="text-amber-500/55" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm leading-tight font-cinzel">Takeaway</p>
                    <p className="text-amber-500/35 text-[10px] mt-0.5">Order &amp; collect</p>
                  </div>
                </motion.button>
              </div>
            </motion.div>

            {/* ════════════════════════════════ 4. DIVIDER */}
            <motion.div
              className="w-full mt-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.32 }}
            >
              <GoldRule />
            </motion.div>

            {/* ════════════════════════════════ 5. MNC SPECIAL CARD */}
            <motion.div
              className="w-full mt-5"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.34, duration: 0.36 }}
            >
              <div
                className="w-full rounded-2xl border border-amber-500/35 overflow-hidden"
                style={{ background: "rgba(245,158,11,0.04)" }}
              >
                {/* Card header */}
                <div className="flex items-center gap-2.5 px-4 pt-4 pb-3
                                border-b border-amber-500/15">
                  <div>
                    <p className="text-white font-bold text-sm leading-tight font-cinzel">
                      MNC Special
                    </p>
                    <p className="text-amber-500/45 text-[10px]">
                      Chef's exclusive picks
                    </p>
                  </div>
                </div>

                {/* CTA inside card */}
                <div className="px-4 py-3">
  <motion.button
    whileTap={{ scale: 0.97 }}
    onClick={goSpecials}
    className="w-full flex items-center justify-between
               bg-amber-400 hover:bg-amber-300
               text-black font-black text-[12px] tracking-wide
               py-3 px-4 rounded-xl transition-all duration-200
               shadow-[0_4px_16px_rgba(251,191,36,0.3)]"
  >
    <span>Order MNC Specials</span>
    <ChevronRight size={15} strokeWidth={3} />
  </motion.button>
</div>
              </div>
            </motion.div>

            {/* ════════════════════════════════ 6. EXPLORE MENU BUTTON */}
            <motion.button
              className="w-full mt-3 flex items-center justify-between
                         border border-amber-500/30 hover:border-amber-500/55
                         text-amber-400 hover:text-amber-300
                         font-bold text-[12px] tracking-wide
                         py-3.5 px-4 rounded-2xl transition-all duration-200"
              style={{ background: "rgba(245,158,11,0.04)" }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.40, duration: 0.34 }}
              whileTap={{ scale: 0.97 }}
              onClick={goMenu}
            >
              <span>Explore Menu</span>
              <ChevronRight size={15} strokeWidth={2.5} />
            </motion.button>

            {/* ════════════════════════════════ 7. FOOTER */}
            <motion.div
              className="w-full mt-5 pt-4 border-t border-amber-500/15
                         flex items-center justify-between gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.46, duration: 0.36 }}
            >
              {/* Instagram */}
              <a
                href="https://instagram.com/midnightcoffeee"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5
                           border border-amber-500/20 hover:border-amber-500/40
                           text-amber-500/55 hover:text-amber-400
                           text-[10px] font-bold tracking-wider
                           py-2.5 rounded-xl transition-colors"
                style={{ background: "rgba(245,158,11,0.04)" }}
              >
                <AtSign size={11} />
                midnightcoffeee
              </a>

              {/* Google Maps / Review Us */}
              <a
                href="https://www.google.com/maps/place/MID+NIGHT+COFFEE,+MNC/@26.9011846,75.7368755,17z/data=!4m8!3m7!1s0x396db5006aa9fcc9:0x40e85b39d3738057!8m2!3d26.9011846!4d75.7368755!9m1!1b1!16s%2Fg%2F11zd31mc2v!18m1!1e1?entry=ttu&g_ep=EgoyMDI2MDgyNi4wIKXMDSoASAFQAw%3D%3D"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5
                           border border-amber-500/20 hover:border-amber-500/40
                           text-amber-500/55 hover:text-amber-400
                           text-[10px] font-bold tracking-wider
                           py-2.5 rounded-xl transition-colors"
                style={{ background: "rgba(245,158,11,0.04)" }}
              >
                Review Us
              </a>
            </motion.div>

          </div>
        </div>
      </div>

      {/* ── TABLE SELECTOR MODAL ── */}
      <AnimatePresence>
        {showSelector && (
          <TableSelector
            onSelect={onTablePick}
            onClose={() => setShowSelector(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}