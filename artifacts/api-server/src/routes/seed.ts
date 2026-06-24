/**
 * Demo seed route — creates GlowNest Studio with realistic sample data.
 * Idempotent: safe to call multiple times (skips if business already exists).
 * POST /api/seed/demo
 */

import { Router } from "express";
import type { IRouter } from "express";
import { db } from "@workspace/db";
import {
  businessesTable,
  servicesTable,
  customersTable,
  bookingsTable,
  conversationsTable,
  messagesTable,
  aiActionLogsTable,
  automationSettingsTable,
  reminderJobsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { scheduleBookingAutomations } from "../lib/automation-service";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/seed/demo", async (_req, res): Promise<void> => {
  logger.info("Seeding GlowNest Studio demo data...");

  // Clear existing data for clean re-seed
  const existing = await db
    .select({ id: businessesTable.id })
    .from(businessesTable)
    .where(eq(businessesTable.id, 1))
    .limit(1);

  if (existing.length > 0) {
    // Wipe old relational data before re-seeding
    await db.delete(aiActionLogsTable).where(eq(aiActionLogsTable.businessId, 1));
    await db.delete(reminderJobsTable).where(eq(reminderJobsTable.businessId, 1));
    const convs = await db.select({ id: conversationsTable.id }).from(conversationsTable).where(eq(conversationsTable.businessId, 1));
    for (const c of convs) {
      await db.delete(messagesTable).where(eq(messagesTable.conversationId, c.id));
    }
    await db.delete(conversationsTable).where(eq(conversationsTable.businessId, 1));
    await db.delete(bookingsTable).where(eq(bookingsTable.businessId, 1));
    await db.delete(customersTable).where(eq(customersTable.businessId, 1));
    await db.delete(servicesTable).where(eq(servicesTable.businessId, 1));
    await db.delete(automationSettingsTable).where(eq(automationSettingsTable.businessId, 1));
  }

  // ─── Business ────────────────────────────────────────────────────────────
  if (existing.length > 0) {
    await db.update(businessesTable).set({
      name: "GlowNest Studio",
      ownerName: "Kavya Reddy",
      phone: "+91 98400 12345",
      whatsappNumber: "+91 98400 12345",
      city: "Bangalore",
      address: "17, Indiranagar 12th Main, Bangalore – 560038",
      googleMapsLink: "https://maps.google.com/?q=GlowNest+Studio+Indiranagar+Bangalore",
      category: "beauty_parlour",
      description: "Premium beauty studio specialising in hair, skin, and bridal makeup.",
      reviewLink: "https://g.page/r/glownest-demo-review",
      isOnboarded: true,
    }).where(eq(businessesTable.id, 1));
  } else {
    await db.insert(businessesTable).values({
      id: 1,
    name: "GlowNest Studio",
    ownerName: "Kavya Reddy",
    phone: "+91 98400 12345",
    whatsappNumber: "+91 98400 12345",
    city: "Bangalore",
    address: "17, Indiranagar 12th Main, Bangalore – 560038",
    googleMapsLink: "https://maps.google.com/?q=GlowNest+Studio+Indiranagar+Bangalore",
    category: "beauty_parlour",
    description: "Premium beauty studio specialising in hair, skin, and bridal makeup. Walk-in welcome, appointments preferred.",
    timezone: "Asia/Kolkata",
    workingHours: {
      mon: { open: "10:00", close: "20:00", isOpen: true },
      tue: { open: "10:00", close: "20:00", isOpen: true },
      wed: { open: "10:00", close: "20:00", isOpen: true },
      thu: { open: "10:00", close: "20:00", isOpen: true },
      fri: { open: "10:00", close: "20:30", isOpen: true },
      sat: { open: "09:00", close: "21:00", isOpen: true },
      sun: { open: "10:00", close: "19:00", isOpen: true },
    },
    cancellationPolicy: "Please cancel at least 2 hours before your appointment. No-show bookings may incur a ₹100 token fee.",
    tokenPolicy: "A ₹200 advance is required for bridal packages.",
    preferredTone: "friendly",
    reviewLink: "https://g.page/r/glownest-demo-review",
    isOnboarded: true,
  });
  }

  // Default automation settings
  await db.insert(automationSettingsTable).values({
    businessId: 1,
    reminder24hEnabled: true,
    reminder2hEnabled: true,
    reviewRequestEnabled: true,
    reviewRequestDelayHours: 2,
    repeatReminderEnabled: true,
    aiAutoReplyEnabled: true,
    aiConfidenceThreshold: 0.78,
    reminderTemplate: "Hi {name}! 💫 Reminder: your {service} is tomorrow at {time} at GlowNest Studio. Can't wait to see you! 🌸",
    reviewTemplate: "Hi {name}! Hope you loved your {service} at GlowNest! 💅 If you have a moment, a Google review means the world to us 🙏 {review_link}",
  });

  // ─── Services ────────────────────────────────────────────────────────────
  const servicesData = [
    { name: "Haircut & Blow Dry", category: "hair", price: "450", durationMinutes: 60, repeatReminderDays: 45, description: "Professional cut + blow dry finish" },
    { name: "Hair Spa Treatment", category: "hair", price: "950", durationMinutes: 90, repeatReminderDays: 30, description: "Deep conditioning + scalp massage + blow dry" },
    { name: "Bridal Makeup", category: "bridal", price: "8500", durationMinutes: 180, requiresConsultation: true, requiresTokenAdvance: true, description: "Full HD bridal makeup with trial included" },
    { name: "Classic Facial", category: "skin", price: "799", durationMinutes: 60, repeatReminderDays: 30, description: "Deep cleansing + extraction + glow mask" },
    { name: "D-Tan Cleanup", category: "skin", price: "499", durationMinutes: 45, repeatReminderDays: 20, description: "De-tanning cleanup with fruit pack" },
    { name: "Nail Extensions (Gel)", category: "nails", price: "1200", durationMinutes: 90, repeatReminderDays: 21, description: "Full set gel nail extensions with nail art" },
    { name: "Threading (Eyebrow)", category: "brow", price: "50", durationMinutes: 15, repeatReminderDays: 15, description: "Precision eyebrow shaping" },
    { name: "Waxing (Full Arms)", category: "waxing", price: "200", durationMinutes: 30, repeatReminderDays: 21, description: "Rica/chocolate wax, full arms" },
  ];

  const insertedServices = await db
    .insert(servicesTable)
    .values(
      servicesData.map((s) => ({
        businessId: 1,
        isActive: true,
        requiresConsultation: false,
        requiresTokenAdvance: false,
        ...s,
      }))
    )
    .returning();

  const svcMap = Object.fromEntries(insertedServices.map((s) => [s.name, s]));

  // ─── Customers ───────────────────────────────────────────────────────────
  const customersData = [
    { name: "Ananya Krishnan", phone: "+91 99001 22001", notes: "Prefers hair spa on Saturdays, sensitive scalp", totalVisits: 8 },
    { name: "Riya Mehta", phone: "+91 99001 22002", notes: "Regular facial client, combination skin", totalVisits: 5 },
    { name: "Sneha Patel", phone: "+91 99001 22003", notes: "Bridal booking confirmed for Dec wedding", totalVisits: 2 },
    { name: "Divya Nair", phone: "+91 99001 22004", notes: "VIP client — always gives reviews", totalVisits: 14 },
    { name: "Pooja Sharma", phone: "+91 99001 22005", notes: "Loves nail extensions, wants art each time", totalVisits: 6 },
    { name: "Meera Iyer", phone: "+91 99001 22006", notes: "First-time customer, found us on Instagram", totalVisits: 1 },
    { name: "Lakshmi Rao", phone: "+91 99001 22007", notes: "", totalVisits: 3 },
  ];

  const insertedCustomers = await db
    .insert(customersTable)
    .values(customersData.map((c) => ({ ...c, businessId: 1, source: "whatsapp", lastVisitAt: new Date() })))
    .returning();

  const custMap = Object.fromEntries(insertedCustomers.map((c) => [c.phone, c]));

  // ─── Bookings ────────────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const dayAfter = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);

  const bookingsData = [
    // Today's bookings
    { date: todayStr, time: "10:00", end: "11:00", status: "confirmed", customer: "+91 99001 22001", svc: "Haircut & Blow Dry", source: "whatsapp", ai: true },
    { date: todayStr, time: "11:30", end: "12:30", status: "confirmed", customer: "+91 99001 22002", svc: "Classic Facial", source: "whatsapp", ai: true },
    { date: todayStr, time: "14:00", end: "15:30", status: "pending", customer: "+91 99001 22005", svc: "Nail Extensions (Gel)", source: "whatsapp", ai: true },
    { date: todayStr, time: "16:00", end: "17:00", status: "confirmed", customer: "+91 99001 22004", svc: "Classic Facial", source: "manual", ai: false },
    // Tomorrow
    { date: tomorrow, time: "10:00", end: "11:30", status: "confirmed", customer: "+91 99001 22001", svc: "Hair Spa Treatment", source: "whatsapp", ai: true },
    { date: tomorrow, time: "12:00", end: "12:45", status: "pending", customer: "+91 99001 22006", svc: "D-Tan Cleanup", source: "whatsapp", ai: true },
    { date: tomorrow, time: "15:00", end: "18:00", status: "confirmed", customer: "+91 99001 22003", svc: "Bridal Makeup", source: "manual", ai: false },
    // Day after
    { date: dayAfter, time: "11:00", end: "12:00", status: "pending", customer: "+91 99001 22007", svc: "Haircut & Blow Dry", source: "whatsapp", ai: true },
    // Next week
    { date: nextWeek, time: "10:00", end: "11:30", status: "pending", customer: "+91 99001 22002", svc: "Hair Spa Treatment", source: "whatsapp", ai: true },
    // Yesterday — completed
    { date: yesterday, time: "10:00", end: "11:00", status: "completed", customer: "+91 99001 22004", svc: "Haircut & Blow Dry", source: "manual", ai: false },
    { date: yesterday, time: "13:00", end: "14:00", status: "completed", customer: "+91 99001 22002", svc: "Classic Facial", source: "whatsapp", ai: true },
    { date: yesterday, time: "15:30", end: "16:00", status: "no_show", customer: "+91 99001 22007", svc: "Threading (Eyebrow)", source: "whatsapp", ai: false },
  ];

  const insertedBookings: Array<typeof bookingsTable.$inferSelect> = [];
  for (const b of bookingsData) {
    const customer = custMap[b.customer];
    const service = svcMap[b.svc];
    if (!customer || !service) continue;

    const [booking] = await db
      .insert(bookingsTable)
      .values({
        businessId: 1,
        customerId: customer.id,
        serviceId: service.id,
        bookingDate: b.date,
        startTime: b.time,
        endTime: b.end,
        status: b.status,
        source: b.source as "whatsapp" | "manual" | "dashboard",
        createdByAI: b.ai,
      })
      .returning();
    insertedBookings.push(booking);

    // Schedule automations for confirmed/pending future bookings
    if (["confirmed", "pending"].includes(b.status) && b.date >= todayStr) {
      await scheduleBookingAutomations(booking.id).catch(() => {});
    }
  }

  // ─── Demo Conversations ───────────────────────────────────────────────────
  const convData = [
    {
      customer: "+91 99001 22001",
      msgs: [
        { d: "inbound", t: "Hi! What's the price for a haircut?" },
        { d: "outbound", t: "Hi Ananya! 💇‍♀️ Our Haircut & Blow Dry is ₹450, takes about 60 mins. Would you like to book?", ai: true },
        { d: "inbound", t: "Yes please! Can I come tomorrow at 10am?" },
        { d: "outbound", t: "Great! We have 10:00 AM free on tomorrow. Booking confirmed ✅ See you then! 🌸", ai: true },
      ],
    },
    {
      customer: "+91 99001 22002",
      msgs: [
        { d: "inbound", t: "Do you do facials? My skin is very dry." },
        { d: "outbound", t: "Yes! Our Classic Facial is ₹799, 60 mins, and perfect for dry skin 🌿 Available today at 11:30 AM — want to book?", ai: true },
        { d: "inbound", t: "That sounds good. Please book me for today 11:30" },
        { d: "outbound", t: "Done! Your facial is booked for today at 11:30 AM ✅ See you soon!", ai: true },
      ],
    },
    {
      customer: "+91 99001 22006",
      msgs: [
        { d: "inbound", t: "Hello, is this GlowNest? I want to book a D-Tan cleanup" },
        { d: "outbound", t: "Hi! Yes, this is GlowNest Studio 🌸 D-Tan Cleanup is ₹499, about 45 mins. When would you like to come?", ai: true },
        { d: "inbound", t: "Tomorrow around noon?" },
        { d: "outbound", t: "12:00 PM is available tomorrow! Shall I confirm that for you? 😊", ai: true },
        { d: "inbound", t: "Yes please! My name is Meera" },
        { d: "outbound", t: "Booked! Meera, your D-Tan Cleanup is confirmed for tomorrow at 12:00 PM ✅ You'll get a reminder the day before. See you! 💫", ai: true },
      ],
    },
    {
      customer: "+91 99001 22004",
      msgs: [
        { d: "inbound", t: "Where are you located? I want to find you on Maps" },
        { d: "outbound", t: "We're at 17, Indiranagar 12th Main, Bangalore 📍 Here's our Google Maps link: https://maps.google.com/?q=GlowNest+Studio+Indiranagar", ai: true },
        { d: "inbound", t: "Perfect! Thank you 🙏" },
      ],
    },
    // Pending approval
    {
      customer: "+91 99001 22003",
      msgs: [
        { d: "inbound", t: "I want bridal makeup for my wedding on December 15th. Can I also get a trial before?" },
        { d: "outbound", t: "Congratulations on your wedding! 🎊 Our Bridal Makeup package is ₹8,500 and includes a full trial session. It requires a ₹200 advance. Would you like to discuss the details?", ai: true, pending: true },
      ],
    },
  ];

  for (const conv of convData) {
    const customer = custMap[conv.customer];
    if (!customer) continue;

    const [conversation] = await db
      .insert(conversationsTable)
      .values({
        businessId: 1,
        customerId: customer.id,
        channel: "whatsapp",
        status: "active",
        lastMessageAt: new Date(Date.now() - Math.random() * 3600000),
      })
      .returning();

    for (const msg of conv.msgs) {
      await db.insert(messagesTable).values({
        conversationId: conversation.id,
        direction: msg.d as "inbound" | "outbound",
        content: msg.t,
        messageType: "text",
        aiGenerated: !!(msg as Record<string, unknown>).ai,
        requiresApproval: !!(msg as Record<string, unknown>).pending,
        sentAt: new Date(Date.now() - Math.random() * 7200000),
      });
    }
  }

  // ─── Pending AI Action (for review) ──────────────────────────────────────
  const sneha = custMap["+91 99001 22003"];
  if (sneha) {
    await db.insert(aiActionLogsTable).values({
      businessId: 1,
      customerId: sneha.id,
      actionType: "booking_request",
      inputSummary: "I want bridal makeup for my wedding on December 15th. Can I also get a trial before?",
      outputSummary: "Bridal inquiry detected, consultation required",
      replyDraft: "Congratulations on your upcoming wedding! 🎊 Our Bridal Makeup package (₹8,500) includes a trial session. Since this requires a consultation, I've flagged this for our team — Kavya will reach out to discuss the details and finalize dates. Expect a call within 24 hours!",
      confidenceScore: 0.61,
      status: "pending",
      requiresHumanReview: true,
    });

    const meera = custMap["+91 99001 22006"];
    if (meera) {
      await db.insert(aiActionLogsTable).values({
        businessId: 1,
        customerId: meera.id,
        actionType: "reschedule_request",
        inputSummary: "Can I move my cleanup to the weekend instead?",
        outputSummary: "Reschedule request, checking availability",
        replyDraft: "Of course, Meera! We have slots on Saturday at 11:00 AM, 2:00 PM, and 4:00 PM. Which works for you?",
        confidenceScore: 0.72,
        status: "pending",
        requiresHumanReview: true,
      });
    }
  }

  logger.info("Demo seed complete — GlowNest Studio ready");

  res.status(201).json({
    ok: true,
    message: "GlowNest Studio demo data seeded successfully",
    summary: {
      business: "GlowNest Studio",
      services: insertedServices.length,
      customers: insertedCustomers.length,
      bookings: insertedBookings.length,
      conversations: convData.length,
    },
  });
});

// DELETE — reset demo (for re-seeding)
router.delete("/seed/demo", async (_req, res): Promise<void> => {
  // Delete in FK order
  await db.delete(aiActionLogsTable).where(eq(aiActionLogsTable.businessId, 1));
  await db.delete(reminderJobsTable).where(eq(reminderJobsTable.businessId, 1));

  const convs = await db.select({ id: conversationsTable.id }).from(conversationsTable).where(eq(conversationsTable.businessId, 1));
  for (const c of convs) {
    await db.delete(messagesTable).where(eq(messagesTable.conversationId, c.id));
  }
  await db.delete(conversationsTable).where(eq(conversationsTable.businessId, 1));
  await db.delete(bookingsTable).where(eq(bookingsTable.businessId, 1));
  await db.delete(customersTable).where(eq(customersTable.businessId, 1));
  await db.delete(servicesTable).where(eq(servicesTable.businessId, 1));
  await db.delete(automationSettingsTable).where(eq(automationSettingsTable.businessId, 1));
  await db.delete(businessesTable).where(eq(businessesTable.id, 1));

  res.json({ ok: true, message: "Demo data cleared. You can re-seed now." });
});

export default router;
