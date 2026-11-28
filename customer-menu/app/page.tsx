'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ForkKnife,
  Armchair,
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  Star,
  ChatCircleDots,
  MapPin,
  Phone,
  Clock,
  Sparkle,
  Plant,
  Flame,
  X,
  GoogleLogo,
  CheckCircle,
  House,
  CaretRight,
  Gift,
} from '@phosphor-icons/react';
import { dynaura } from 'dynaura';
import {
  getMenu,
  getRestaurantInfo,
  createReservation,
  createFeedback,
  getPublicFeedback,
  getPublicTables,
} from '@/lib/api';
import type {
  MenuItem,
  RestaurantInfo,
  PublicReview,
} from '@/lib/types';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CustomerAccountDrawer, AccountButton } from '@/components/CustomerAccountDrawer';

// Helper to get local date string YYYY-MM-DD
const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to get local time string HH:MM
const getCurrentTimeString = () => {
  const d = new Date();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

// Helper for smart default reservation time (30 mins ahead)
const getDefaultReserveTime = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

export default function CustomerFrontHomeScreen() {
  const router = useRouter();

  // Dynamic database states
  const [restaurant, setRestaurant] = useState<RestaurantInfo | null>(null);
  const [publicReviews, setPublicReviews] = useState<PublicReview[]>([]);
  const [chefSpecials, setChefSpecials] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);

  // Table input state
  const [tableInput, setTableInput] = useState('');

  // Apple-style bottom sheets / modals
  const [isTableSheetOpen, setIsTableSheetOpen] = useState(false);
  const [isReserveSheetOpen, setIsReserveSheetOpen] = useState(false);
  const [isFeedbackSheetOpen, setIsFeedbackSheetOpen] = useState(false);

  // Reservation form
  const [reserveName, setReserveName] = useState('');
  const [reservePhone, setReservePhone] = useState('');
  const [reserveGuests, setReserveGuests] = useState(2);
  const [reserveDate, setReserveDate] = useState(getTodayDateString);
  const [reserveTime, setReserveTime] = useState(getDefaultReserveTime);
  const [reserveNotes, setReserveNotes] = useState('');
  const [reserveHoneypot, setReserveHoneypot] = useState('');
  const [isSubmittingReservation, setIsSubmittingReservation] = useState(false);
  const isSubmittingReservationRef = useRef(false);

  const [showFullMenu, setShowFullMenu] = useState(false);
  // Feedback form
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackName, setFeedbackName] = useState('');
  const [feedbackPhone, setFeedbackPhone] = useState('');
  const [feedbackHoneypot, setFeedbackHoneypot] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const isSubmittingFeedbackRef = useRef(false);

  useEffect(() => {
    if (!isFeedbackSheetOpen) return;
    setFeedbackName(localStorage.getItem('customer_name') || '');
    setFeedbackPhone(localStorage.getItem('customer_phone') || '');
  }, [isFeedbackSheetOpen]);
  useEffect(() => {
    const open = () => { setFeedbackSubmitted(false); setIsFeedbackSheetOpen(true); };
    if (new URLSearchParams(window.location.search).has('feedback')) open();
    window.addEventListener('settlement-feedback', open);
    return () => window.removeEventListener('settlement-feedback', open);
  }, []);

  // Fetch all data dynamically from the database
  useEffect(() => {
    async function loadDatabaseData() {
      setIsLoading(true);
      try {
        const [restRes, menuRes, feedbackRes] = await Promise.allSettled([
          getRestaurantInfo(),
          getMenu(),
          getPublicFeedback(),
        ]);

        if (restRes.status === 'fulfilled' && restRes.value?.data) {
          setRestaurant(restRes.value.data);
        }

        if (menuRes.status === 'fulfilled' && menuRes.value?.data?.items?.length) {
          const items: MenuItem[] = menuRes.value.data.items;
          const available = items.filter((i) => i.is_available);
          setChefSpecials(available);
        }

        if (feedbackRes.status === 'fulfilled' && Array.isArray(feedbackRes.value?.data)) {
          setPublicReviews(feedbackRes.value.data);
        }
      } catch (err) {
        console.error('Error loading restaurant data:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadDatabaseData();
  }, []);

  const [tableLookupError, setTableLookupError] = useState('');
  const [findingTable, setFindingTable] = useState(false);

  const handleTableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = tableInput.trim();
    if (!input || findingTable) return;
    const normalize = (label: string) => {
      const digits = /^(?:t(?:bl)?[- ]?)?0*(\d+)$/i.exec(label.trim());
      return digits ? digits[1] : label.trim().toLowerCase();
    };
    setFindingTable(true);
    setTableLookupError('');
    try {
      const { data } = await getPublicTables();
      const tables = data as { number: string; table_number?: string; qr_token?: string }[];
      if (tables.length === 0) {
        setTableLookupError('The restaurant has not published its tables yet. Please ask staff for the menu.');
        return;
      }
      const matches = tables.filter(t => [t.number, t.table_number].some(
        label => label && normalize(label) === normalize(input),
      ));
      const table = matches.find(t => t.number === input) ?? (matches.length === 1 ? matches[0] : undefined);
      if (!table) {
        setTableLookupError('Could not find that table. Check the number or scan its QR code.');
        return;
      }
      // Older API deployments omit the token for the starter tables.
      const number = normalize(table.number);
      const token = table.qr_token ?? (/^\d+$/.test(number) ? 'tbl-' + number.padStart(2, '0') : table.number);
      setIsTableSheetOpen(false);
      router.push(`/table/${encodeURIComponent(token)}`);
    } catch {
      setTableLookupError('Unable to load the table list. Please try again.');
    } finally {
      setFindingTable(false);
    }
  };

  const handleReservationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingReservationRef.current || isSubmittingReservation) return;
    if (reserveHoneypot) return; // PentAGI anti-bot honeypot

    const cleanPhone = reservePhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      dynaura.error({
        title: 'Invalid Mobile Number',
        description: 'Please enter a valid 10-digit number.',
      });
      return;
    }

    const todayStr = getTodayDateString();
    if (reserveDate < todayStr) {
      dynaura.error({
        title: 'Past Date Not Allowed',
        description: 'Please select today or a future date for your reservation.',
      });
      return;
    }

    const combinedDateTime = new Date(`${reserveDate}T${reserveTime}:00`);
    if (isNaN(combinedDateTime.getTime())) {
      dynaura.error({
        title: 'Invalid Date or Time',
        description: 'Please enter a valid reservation date and time.',
      });
      return;
    }

    // Guard against past time slots for today (with a 15-minute grace window for clock skew)
    const now = new Date();
    if (combinedDateTime < new Date(now.getTime() - 15 * 60 * 1000)) {
      dynaura.error({
        title: 'Time Slot In The Past',
        description: 'Please select a future time slot for today.',
      });
      return;
    }

    isSubmittingReservationRef.current = true;
    setIsSubmittingReservation(true);
    try {
      await createReservation({
        customer_name: reserveName.trim(),
        customer_phone: cleanPhone,
        guest_count: Number(reserveGuests),
        reservation_time: combinedDateTime.toISOString(),
        special_requests: reserveNotes.trim() || undefined,
        honeypot: reserveHoneypot || undefined,
      });

      dynaura.success({
        title: 'Reservation Request Sent',
        description: `Thank you for choosing us! We received your request for ${reserveGuests} guests on ${reserveDate} at ${reserveTime}. You will receive a WhatsApp message once your table is confirmed.`,
      });
      setIsReserveSheetOpen(false);
      setReserveNotes('');
    } catch (err: any) {
      dynaura.error({
        title: 'Reservation Failed',
        description: err.message || 'Could not complete reservation.',
      });
    } finally {
      isSubmittingReservationRef.current = false;
      setIsSubmittingReservation(false);
    }
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingFeedbackRef.current || isSubmittingFeedback) return;
    if (feedbackHoneypot) return;

    isSubmittingFeedbackRef.current = true;
    setIsSubmittingFeedback(true);
    try {
      await createFeedback({
        customer_name: feedbackName.trim() || undefined,
        customer_phone: feedbackPhone.trim() || undefined,
        rating: feedbackRating,
        comments: feedbackComment.trim() || undefined,
        honeypot: feedbackHoneypot || undefined,
      });

      setFeedbackSubmitted(true);
      dynaura.success({
        title: 'Feedback Submitted',
        description: 'Thank you for helping us improve our food and service.',
      });

      if (feedbackComment.trim()) {
        setPublicReviews((prev) => [
          {
            id: `temp-${Date.now()}`,
            customer_name: feedbackName.trim() || 'Verified Diner',
            rating: feedbackRating,
            comments: feedbackComment.trim(),
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
    } catch (err: any) {
      dynaura.error({
        title: 'Submission Error',
        description: err.message || 'Failed to submit feedback.',
      });
    } finally {
      isSubmittingFeedbackRef.current = false;
      setIsSubmittingFeedback(false);
    }
  };

  const restaurantName = restaurant?.name || 'GuruKripa Dhaba';
  const restaurantTagline = restaurant?.tagline || 'Authentic Desi Flavors & Tandoor Specialties';
  const restaurantAddress = restaurant?.address || 'National Highway 44, Mile 14';
  const restaurantPhone = restaurant?.phone || '+91 98765 43210';
  const isOnline = restaurant?.restaurant_status !== 'OFFLINE';
  const googleReviewUrl =
    restaurant?.google_review_url ||
    `https://search.google.com/local/writereview?placeid=ChIJ${encodeURIComponent(restaurantName.replace(/\s+/g, ''))}`;

  // Infinite marquee review loop: duplicate list once when >= 2 items for seamless 50% translation
  const marqueeReviews = useMemo(() => {
    if (publicReviews.length <= 1) return publicReviews;
    return [...publicReviews, ...publicReviews];
  }, [publicReviews]);

  return (
    <div className="min-h-dvh bg-[#f8f6f2] dark:bg-[#0c0e12] text-neutral-900 dark:text-neutral-100 flex flex-col font-sans transition-colors duration-200 pb-24 sm:pb-12">
      {/* ── Sticky Apple-Glass Header ───────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#f8f6f2]/85 dark:bg-[#0c0e12]/85 backdrop-blur-xl border-b border-neutral-200/60 dark:border-neutral-800/60 px-4 sm:px-8 py-3 transition-colors">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/appicon.svg"
              alt={restaurantName}
              className="w-10 h-10 rounded-2xl shadow-md shadow-orange-500/10 object-contain touch-tactile shrink-0"
            />
            <div>
              <span className="font-black text-base sm:text-lg tracking-tight font-display text-neutral-900 dark:text-white line-clamp-1">
                {restaurantName}
              </span>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium line-clamp-1">
                {restaurantAddress}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <AccountButton onClick={() => setAccountOpen(true)} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── Main Content Container ─────────────────────────────────────────── */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-8 py-5 space-y-9 animate-fade-in">
        {/* Hero Section */}
        {isLoading ? (
          <div className="h-64 sm:h-72 rounded-3xl bg-neutral-200/80 dark:bg-neutral-800/80 animate-pulse" />
        ) : (
          <section className="relative overflow-hidden rounded-3xl bg-neutral-900 text-white p-6 sm:p-10 shadow-xl border border-neutral-800 animate-scale-spring">
            <div className="absolute inset-0 z-0 opacity-25 mix-blend-overlay">
              <img
                src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=80"
                alt="Restaurant Atmosphere"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="relative z-10 space-y-4 max-w-xl">
              <div className="inline-flex items-center gap-1.5 bg-orange-500/20 text-orange-300 border border-orange-500/30 px-3 py-1 rounded-full text-[11px] font-bold">
                <Sparkle size={14} weight="fill" />
                <span>{restaurantTagline}</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight font-display">
                Farm-Fresh Recipes, Pure Flavors & Instant Table Dining.
              </h1>
              <p className="text-neutral-300 text-xs sm:text-sm leading-relaxed">
                Slow-simmered gravies, clay-oven tandoor breads, and direct-to-kitchen mobile ordering.
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-2.5">
                <button
                  onClick={() => setIsTableSheetOpen(true)}
                  className="touch-tactile bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs sm:text-sm px-4 sm:px-5 py-3 rounded-2xl transition-all shadow-lg shadow-orange-500/25 flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <Armchair size={18} weight="bold" />
                  <span>Enter Table Number</span>
                  <ArrowRight size={14} weight="bold" />
                </button>

                <button
                  onClick={() => setIsReserveSheetOpen(true)}
                  className="touch-tactile bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold text-xs sm:text-sm px-3.5 sm:px-4 py-3 rounded-2xl transition-all flex items-center gap-1.5 cursor-pointer backdrop-blur-sm active:scale-95"
                >
                  <CalendarCheck size={18} weight="bold" />
                  <span>Book a Table</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── Apple Grouped Inset Menu (Clean Unified Rows - Top Position) ─── */}
        <section className="space-y-2">
          <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider px-1">
            Dining Services & Care
          </h2>
          <div className="bg-white dark:bg-neutral-800/90 rounded-2xl border border-neutral-200/80 dark:border-neutral-700/80 shadow-xs divide-y divide-neutral-100 dark:divide-neutral-700/70 overflow-hidden">
            {/* Row 1: Book Table */}
            <button
              onClick={() => setIsReserveSheetOpen(true)}
              className="touch-tactile w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-neutral-50 dark:hover:bg-neutral-750 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <CalendarCheck size={18} weight="bold" />
                </div>
                <div>
                  <div className="font-bold text-xs sm:text-sm text-neutral-900 dark:text-white">
                    Book a Table in Advance
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Reserve dining space for family feasts or road trips.
                  </div>
                </div>
              </div>
              <CaretRight size={16} weight="bold" className="text-neutral-400 shrink-0" />
            </button>

            {/* Row 2: Customer Feedback */}
            <button
              onClick={() => setIsFeedbackSheetOpen(true)}
              className="touch-tactile w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-neutral-50 dark:hover:bg-neutral-750 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Star size={18} weight="fill" />
                </div>
                <div>
                  <div className="font-bold text-xs sm:text-sm text-neutral-900 dark:text-white">
                    Share Dining Feedback
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Rate dish taste, hygiene, or kitchen service.
                  </div>
                </div>
              </div>
              <CaretRight size={16} weight="bold" className="text-neutral-400 shrink-0" />
            </button>

            {/* Row 3: Google Reviews */}
            <a
              href={googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="touch-tactile w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-neutral-50 dark:hover:bg-neutral-750 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <GoogleLogo size={18} weight="bold" />
                </div>
                <div>
                  <div className="font-bold text-xs sm:text-sm text-neutral-900 dark:text-white">
                    Post a Google Maps Review
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Help other travelers locate authentic dhaba meals.
                  </div>
                </div>
              </div>
              <ArrowUpRight size={16} weight="bold" className="text-neutral-400 shrink-0" />
            </a>

            {/* Row 4: Phone Support */}
            <a
              href={`tel:${restaurantPhone}`}
              className="touch-tactile w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-neutral-50 dark:hover:bg-neutral-750 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                  <Phone size={18} weight="bold" />
                </div>
                <div>
                  <div className="font-bold text-xs sm:text-sm text-neutral-900 dark:text-white">
                    Call Restaurant: {restaurantPhone}
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Open daily for dining, highway takeaway & queries.
                  </div>
                </div>
              </div>
              <ArrowRight size={16} weight="bold" className="text-neutral-400 shrink-0" />
            </a>

            {/* Row 5: 7-Visit Loyalty Program */}
            <div className="w-full px-4 py-3.5 flex items-center justify-between text-left bg-gradient-to-r from-amber-50/50 to-orange-50/30 dark:from-amber-950/30 dark:to-orange-950/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Gift size={18} weight="fill" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs sm:text-sm text-neutral-900 dark:text-white">
                      7-Visit Loyalty Milestone
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300 bg-amber-200/70 dark:bg-amber-900/60 px-2 py-0.5 rounded-full">
                      50% OFF / Free Meal
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Link your mobile number at checkout; every dining visit counts towards your 7th visit celebration reward.
                  </div>
                </div>
              </div>
              <Sparkle size={16} weight="fill" className="text-amber-500 shrink-0" />
            </div>
          </div>
        </section>

        {/* ── Chef Recommended Dishes (Database Powered) ────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between border-b border-neutral-200/60 dark:border-neutral-800 pb-2">
            <div className="flex items-center gap-2">
              <Sparkle size={18} weight="fill" className="text-orange-500" />
              <h2 className="text-sm sm:text-base font-black tracking-tight font-display text-neutral-900 dark:text-white uppercase tracking-wider">
                {showFullMenu ? "Full Menu" : "Chef Recommended Dishes"}
              </h2>
            </div>
            <button
              onClick={() => setShowFullMenu(v => !v)}
              className="text-xs font-bold text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>{showFullMenu ? "Show fewer dishes" : "Full Menu"}</span>
              <ArrowRight size={12} weight="bold" />
            </button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-48 rounded-2xl bg-neutral-200/70 dark:bg-neutral-800/70 animate-pulse" />
              ))}
            </div>
          ) : chefSpecials.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {(showFullMenu ? chefSpecials : chefSpecials.slice(0, 6)).map((dish) => (
                <div
                  key={dish.id}
                  onClick={() => setIsTableSheetOpen(true)}
                  className="touch-tactile bg-white dark:bg-neutral-800/90 rounded-2xl border border-neutral-200/80 dark:border-neutral-700/80 overflow-hidden shadow-xs flex flex-col justify-between cursor-pointer group"
                >
                  <div className="relative h-40 overflow-hidden bg-neutral-100 dark:bg-neutral-900">
                    <img
                      src={dish.image_url || 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80'}
                      alt={dish.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-2 left-2">
                      {dish.is_veg ? (
                        <span className="inline-flex items-center gap-1 bg-white/95 dark:bg-neutral-900/95 text-emerald-700 dark:text-emerald-400 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-300/60 dark:border-emerald-700 shadow-xs">
                          <Plant size={12} weight="fill" />
                          <span>Veg</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-white/95 dark:bg-neutral-900/95 text-rose-700 dark:text-rose-400 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-rose-300/60 dark:border-rose-700 shadow-xs">
                          <Flame size={12} weight="fill" />
                          <span>Non-Veg</span>
                        </span>
                      )}
                    </div>
                    {dish.preparation_time_minutes && (
                      <div className="absolute bottom-2 right-2 bg-neutral-950/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 backdrop-blur-xs">
                        <Clock size={12} weight="bold" />
                        <span>{dish.preparation_time_minutes} min</span>
                      </div>
                    )}
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between space-y-2">
                    <div>
                      <h3 className="font-bold text-sm text-neutral-900 dark:text-white line-clamp-1">
                        {dish.name}
                      </h3>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
                        {dish.description || 'Authentic preparation with fresh kitchen ingredients.'}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-neutral-100 dark:border-neutral-700 flex items-center justify-between">
                      <span className="text-sm font-black text-neutral-900 dark:text-white font-mono">
                        ₹{Math.round(dish.base_price_paise / 100)}
                      </span>
                      <span className="text-orange-600 dark:text-orange-400 font-bold text-xs flex items-center gap-1">
                        <span>Order</span>
                        <ArrowRight size={12} weight="bold" />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-white dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-neutral-800 text-center text-xs text-neutral-500 dark:text-neutral-400">
              Kitchen is currently preparing today's specials. Tap above to enter your table number and view live items.
            </div>
          )}
        </section>

        {/* ── Guest Reviews & Stories (Live Database Autoscroll) ────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between border-b border-neutral-200/60 dark:border-neutral-800 pb-2">
            <div className="flex items-center gap-2">
              <Star size={18} weight="fill" className="text-amber-500" />
              <h2 className="text-sm sm:text-base font-black tracking-tight font-display text-neutral-900 dark:text-white uppercase tracking-wider">
                Customer Reviews
              </h2>
            </div>
            <button
              onClick={() => setIsFeedbackSheetOpen(true)}
              className="text-xs font-bold text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Leave Feedback</span>
              <ArrowRight size={12} weight="bold" />
            </button>
          </div>

          {publicReviews.length > 0 ? (
            <div className="relative w-full overflow-hidden py-1">
              {/* Apple-style subtle edge fade masks when multiple reviews scroll */}
              {publicReviews.length > 1 && (
                <>
                  <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 sm:w-16 bg-gradient-to-r from-[#f8f6f2] dark:from-[#0c0e12] to-transparent z-10" />
                  <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 sm:w-16 bg-gradient-to-l from-[#f8f6f2] dark:from-[#0c0e12] to-transparent z-10" />
                </>
              )}

              <div
                className={`flex gap-3 py-1 ${
                  publicReviews.length > 1
                    ? 'animate-marquee'
                    : 'justify-center'
                }`}
              >
                {marqueeReviews.map((rev, idx) => (
                  <div
                    key={`${rev.id}-${idx}`}
                    className="w-[280px] sm:w-[320px] shrink-0 bg-white dark:bg-neutral-800/90 rounded-2xl p-4 border border-neutral-200/70 dark:border-neutral-700/60 shadow-xs flex flex-col justify-between space-y-3 select-none"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-0.5 text-amber-400">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              size={13}
                              weight={s <= rev.rating ? 'fill' : 'regular'}
                              className={s <= rev.rating ? 'text-amber-400' : 'text-neutral-300 dark:text-neutral-600'}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-neutral-400 font-medium">
                          {new Date(rev.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <p className="text-xs text-neutral-700 dark:text-neutral-200 italic leading-relaxed line-clamp-3">
                        &ldquo;{rev.comments || 'Great dining experience!'}&rdquo;
                      </p>

                      {rev.resolution_note && (
                        <div className="p-2 rounded-xl bg-orange-50/80 dark:bg-orange-950/40 border border-orange-200/60 dark:border-orange-900/40 text-[10px] space-y-0.5">
                          <span className="font-bold text-orange-800 dark:text-orange-300 block">
                            Manager Note:
                          </span>
                          <p className="text-neutral-600 dark:text-neutral-300 line-clamp-2">
                            {rev.resolution_note}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-neutral-100 dark:border-neutral-700/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold text-[10px] flex items-center justify-center uppercase">
                          {(rev.customer_name || 'V')[0]}
                        </div>
                        <span className="font-bold text-neutral-900 dark:text-white truncate max-w-[120px]">
                          {rev.customer_name || 'Valued Diner'}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 shrink-0">
                        <CheckCircle size={12} weight="bold" /> Verified Guest
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-white dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-neutral-800 text-center space-y-3">
              <div className="w-10 h-10 mx-auto rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-500 flex items-center justify-center">
                <ChatCircleDots size={22} weight="bold" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                  No diner reviews yet
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Dined with us recently? Be the first to share your dining experience!
                </p>
              </div>
              <button
                onClick={() => setIsFeedbackSheetOpen(true)}
                className="touch-tactile inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
              >
                <ChatCircleDots size={16} weight="bold" />
                <span>Write the First Review</span>
              </button>
            </div>
          )}
        </section>

      </main>

      {/* ── Mobile Sticky Bottom Tab Bar (Apple Style) ──────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl border-t border-neutral-200/80 dark:border-neutral-800 px-4 py-2 sm:hidden flex items-center justify-around shadow-lg">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="touch-tactile flex flex-col items-center gap-1 text-[10px] font-bold text-orange-600 dark:text-orange-400"
        >
          <House size={20} weight="fill" />
          <span>Home</span>
        </button>

        <button
          onClick={() => setIsTableSheetOpen(true)}
          className="touch-tactile flex flex-col items-center gap-1 text-[10px] font-bold text-neutral-600 dark:text-neutral-400 hover:text-orange-600"
        >
          <Armchair size={20} weight="bold" />
          <span>Dine-In</span>
        </button>

        <button
          onClick={() => setIsReserveSheetOpen(true)}
          className="touch-tactile flex flex-col items-center gap-1 text-[10px] font-bold text-neutral-600 dark:text-neutral-400 hover:text-orange-600"
        >
          <CalendarCheck size={20} weight="bold" />
          <span>Book</span>
        </button>

        <button
          onClick={() => setIsFeedbackSheetOpen(true)}
          className="touch-tactile flex flex-col items-center gap-1 text-[10px] font-bold text-neutral-600 dark:text-neutral-400 hover:text-orange-600"
        >
          <Star size={20} weight="bold" />
          <span>Review</span>
        </button>
      </nav>

      {/* ── Enter Table Number Bottom Sheet ─────────────────────────────────── */}
      {isTableSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-neutral-950/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full sm:max-w-md bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-3xl p-6 border-t sm:border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4 animate-slide-up-spring">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
              <div className="flex items-center gap-2 font-black text-neutral-900 dark:text-white">
                <Armchair size={20} weight="bold" className="text-orange-500" />
                <span>Enter Table Number</span>
              </div>
              <button
                onClick={() => setIsTableSheetOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1.5 rounded-xl cursor-pointer"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Enter the table number shown on your table standee (e.g. 1, 2, 3) to view the menu and send food directly to the kitchen.
            </p>

            {tableLookupError && <p role="alert">{tableLookupError}</p>}
            <form onSubmit={handleTableSubmit} className="space-y-4 pt-1">
              <div>
                <input
                  type="text"
                  placeholder="e.g. 1, 2, 3 or T-01"
                  value={tableInput}
                  onChange={(e) => { setTableInput(e.target.value); setTableLookupError(''); }}
                  autoFocus
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 font-medium"
                />
              </div>

              <button
                type="submit"
                disabled={!tableInput.trim() || findingTable}
                className="touch-tactile w-full bg-orange-500 hover:bg-orange-600 active:scale-95 disabled:opacity-40 text-white font-bold text-xs py-3 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Open Digital Menu</span>
                <ArrowRight size={14} weight="bold" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Table Reservation Bottom Sheet ──────────────────────────────────── */}
      {isReserveSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-neutral-950/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full sm:max-w-md bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-3xl p-6 border-t sm:border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-slide-up-spring">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
              <div className="flex items-center gap-2 font-black text-neutral-900 dark:text-white">
                <CalendarCheck size={20} weight="bold" className="text-emerald-500" />
                <span>Reserve a Dining Table</span>
              </div>
              <button
                onClick={() => setIsReserveSheetOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1.5 rounded-xl cursor-pointer"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <form onSubmit={handleReservationSubmit} className="space-y-3 text-xs">
              {/* PentAGI Honeypot */}
              <input
                type="text"
                name="company_website"
                value={reserveHoneypot}
                onChange={(e) => setReserveHoneypot(e.target.value)}
                tabIndex={-1}
                aria-hidden="true"
                style={{ display: 'none' }}
              />

              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Sharma"
                  value={reserveName}
                  onChange={(e) => setReserveName(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Mobile Number (10 Digits)
                </label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  placeholder="e.g. 9876543210"
                  value={reservePhone}
                  onChange={(e) => setReservePhone(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    min={getTodayDateString()}
                    value={reserveDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      const minVal = getTodayDateString();
                      if (val && val < minVal) {
                        dynaura.warning({
                          title: 'Date Adjusted',
                          description: 'Reservation date cannot be before today.',
                        });
                        setReserveDate(minVal);
                        if (reserveTime < getCurrentTimeString()) {
                          setReserveTime(getDefaultReserveTime());
                        }
                      } else {
                        setReserveDate(val);
                        if (val === minVal && reserveTime < getCurrentTimeString()) {
                          setReserveTime(getDefaultReserveTime());
                        }
                      }
                    }}
                    className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Time
                  </label>
                  <input
                    type="time"
                    required
                    min={reserveDate === getTodayDateString() ? getCurrentTimeString() : undefined}
                    value={reserveTime}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (reserveDate === getTodayDateString()) {
                        const cur = getCurrentTimeString();
                        if (val && val < cur) {
                          dynaura.warning({
                            title: 'Time Adjusted',
                            description: 'Reservation time cannot be in the past.',
                          });
                          setReserveTime(getDefaultReserveTime());
                          return;
                        }
                      }
                      setReserveTime(val);
                    }}
                    className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1 flex items-center justify-between">
                  <span>Guest Count</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                    {reserveGuests} Guests
                  </span>
                </label>
                <div className="flex gap-2">
                  {[2, 4, 6, 8, 12].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setReserveGuests(num)}
                      className={`touch-tactile flex-1 py-2 rounded-xl font-bold text-xs border transition-colors cursor-pointer ${
                        reserveGuests === num
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Special Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  maxLength={300}
                  placeholder="e.g. High chair, birthday table..."
                  value={reserveNotes}
                  onChange={(e) => setReserveNotes(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none"
                />
              </div>

              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 text-center flex items-center justify-center gap-1.5 py-0.5">
                <ChatCircleDots size={14} className="text-emerald-500 shrink-0" />
                <span>We review table availability and notify you directly on WhatsApp.</span>
              </div>

              <button
                type="submit"
                disabled={isSubmittingReservation || !reserveName.trim() || !reservePhone.trim()}
                className="touch-tactile w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-40 text-white font-bold py-3 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <CalendarCheck size={16} weight="bold" />
                <span>{isSubmittingReservation ? 'Sending Request...' : 'Request Table Reservation'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Dining Feedback Bottom Sheet ────────────────────────────────────── */}
      {isFeedbackSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-neutral-950/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full sm:max-w-md bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-3xl p-6 border-t sm:border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-slide-up-spring">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
              <div className="flex items-center gap-2 font-black text-neutral-900 dark:text-white">
                <ChatCircleDots size={20} weight="bold" className="text-orange-500" />
                <span>Guest Experience & Review</span>
              </div>
              <button
                onClick={() => {
                  setIsFeedbackSheetOpen(false);
                  setFeedbackSubmitted(false);
                }}
                className="text-neutral-400 hover:text-neutral-600 p-1.5 rounded-xl cursor-pointer"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            {feedbackSubmitted ? (
              <div className="text-center py-6 space-y-4 animate-scale-spring">
                <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
                  <CheckCircle size={32} weight="bold" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-black text-lg text-neutral-900 dark:text-white">
                    Feedback Received
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-xs mx-auto">
                    Your remarks have been forwarded directly to restaurant management.
                  </p>
                </div>

                {feedbackRating >= 4 && (
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200/80 dark:border-amber-800/60 space-y-2 text-left">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
                      <GoogleLogo size={16} weight="bold" className="text-amber-600" />
                      <span>Enjoyed your meal? Share it on Google!</span>
                    </div>
                    <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                      A quick Google review helps fellow highway travelers discover authentic food.
                    </p>
                    <a
                      href={googleReviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="touch-tactile w-full inline-flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition-colors shadow-xs"
                    >
                      <span>Post on Google Reviews</span>
                      <ArrowUpRight size={14} weight="bold" />
                    </a>
                  </div>
                )}

                <button
                  onClick={() => {
                    setIsFeedbackSheetOpen(false);
                    setFeedbackSubmitted(false);
                  }}
                  className="touch-tactile w-full py-2.5 bg-neutral-900 dark:bg-neutral-800 text-white font-bold text-xs rounded-xl"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleFeedbackSubmit} className="space-y-3 text-xs">
                {/* PentAGI Honeypot */}
                <input
                  type="text"
                  name="user_homepage"
                  value={feedbackHoneypot}
                  onChange={(e) => setFeedbackHoneypot(e.target.value)}
                  tabIndex={-1}
                  aria-hidden="true"
                  style={{ display: 'none' }}
                />

                <div className="space-y-1 text-center">
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300">
                    How was your food and service?
                  </label>
                  <div className="flex justify-center gap-2 pt-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setFeedbackRating(star)}
                        className="touch-tactile p-1 text-amber-400 active:scale-125 transition-transform cursor-pointer"
                      >
                        <Star
                          size={28}
                          weight={feedbackRating >= star ? 'fill' : 'regular'}
                          className={feedbackRating >= star ? 'text-amber-400' : 'text-neutral-300 dark:text-neutral-600'}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Comments or Suggestions
                  </label>
                  <textarea
                    rows={3}
                    maxLength={600}
                    placeholder="Tell us about the flavors, warmth, service speed..."
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Priya"
                      required minLength={1} value={feedbackName}
                      onChange={(e) => setFeedbackName(e.target.value)}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-neutral-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      required pattern="[+]?[0-9 ]{10,16}" value={feedbackPhone}
                      onChange={(e) => setFeedbackPhone(e.target.value)}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-neutral-900 dark:text-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingFeedback}
                  className="touch-tactile w-full bg-orange-500 hover:bg-orange-600 active:scale-95 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ChatCircleDots size={16} weight="bold" />
                  <span>{isSubmittingFeedback ? 'Submitting...' : 'Submit Feedback'}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Swiggy/Zomato style Customer Account Drawer */}
      <CustomerAccountDrawer
        isOpen={accountOpen}
        onClose={() => setAccountOpen(false)}
      />
    </div>
  );
}
