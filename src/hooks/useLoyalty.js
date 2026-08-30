/**
 * useLoyalty
 *
 * Manages per-customer loyalty state stored in Firestore using manual phone input:
 *   loyalty_profiles/{phoneNumber}  →  { phone, completedOrders, lastOrderDate, updatedAt }
 */

import { useState, useCallback } from "react";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";

export const STREAK_TARGET = 7;

// Sanitise phone to a safe Firestore document key (strip +, spaces, dashes)
export function sanitisePhone(phone) {
  return phone ? phone.replace(/[^0-9]/g, "") : "";
}

export function useLoyalty() {
  const [completedOrders, setCompletedOrders] = useState(0);
  const [loading, setLoading]                 = useState(false);

  // ── Fetch profile using manually typed/saved phone number ─────────────────
  const fetchProfile = useCallback(async (rawPhone) => {
    const key = sanitisePhone(rawPhone);
    if (!key || key.length < 10) return 0;
    
    setLoading(true);
    try {
      const ref  = doc(db, "loyalty_profiles", key);
      const snap = await getDoc(ref);
      const count = snap.exists() ? (snap.data().completedOrders ?? 0) : 0;
      setCompletedOrders(count);
      return count;
    } catch (err) {
      console.error("useLoyalty fetchProfile error:", err);
      return 0;
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Record a completed order with 1-order-per-day restriction ─────────────
  const recordOrder = useCallback(async (rawPhone) => {
    const key = sanitisePhone(rawPhone);
    if (!key || key.length < 10) return 0;
    
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
    
    try {
      const ref  = doc(db, "loyalty_profiles", key);
      const snap = await getDoc(ref);
      
      let prev = 0;
      if (snap.exists()) {
        const data = snap.data();
        // Agar is phone number se aaj ke din pehle hi order ho chuka hai, toh streak mat badhao
        if (data.lastOrderDate === today) {
          const currentCount = data.completedOrders ?? 0;
          setCompletedOrders(currentCount);
          return currentCount;
        }
        prev = data.completedOrders ?? 0;
      }

      // Increment; if we just hit the streak target, the next cycle starts at 0
      const next = prev + 1 >= STREAK_TARGET ? 0 : prev + 1;

      await setDoc(
        ref,
        { 
          phone: rawPhone, 
          completedOrders: next, 
          lastOrderDate: today, 
          updatedAt: serverTimestamp() 
        },
        { merge: true }
      );

      setCompletedOrders(next);
      return next;
    } catch (err) {
      console.error("useLoyalty recordOrder error:", err);
      return 0;
    }
  }, []);

  // ── How many steps until the free reward? ─────────────────────────────────
  const stepsRemaining = STREAK_TARGET - completedOrders;
  const isRewardOrder  = completedOrders + 1 === STREAK_TARGET;

  return {
    completedOrders,
    loading,
    stepsRemaining,
    isRewardOrder,
    fetchProfile,
    recordOrder,
  };
}