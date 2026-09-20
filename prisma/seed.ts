import { PrismaClient, Stage, ProposalStatus } from "@prisma/client";
import { ONBOARDING_CHECKLIST_TEMPLATE } from "../lib/constants";

const prisma = new PrismaClient();

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

const SOURCES = ["Referral", "Website", "LinkedIn", "Cold Email", "Event / Conference"];

const COMPANIES = [
  "Northwind Logistics", "Cedar & Vine Hospitality", "BrightPath Dental",
  "Apex Manufacturing", "Harbor Point Realty", "Summit Fitness Co",
  "Lakeside Veterinary", "Ironclad Security", "Green Leaf Landscaping",
  "Metro Coffee Roasters", "Pioneer Auto Group", "Silverline Consulting",
  "Bayside Construction", "Quill & Co Marketing", "Redwood Wellness",
  "Atlas Freight", "Beacon Financial", "Coastal Property Mgmt",
];

const FIRST = ["Alex", "Jamie", "Taylor", "Morgan", "Riley", "Casey", "Jordan", "Drew", "Cameron", "Reese", "Quinn", "Avery", "Skyler", "Devon", "Parker", "Rowan", "Sage", "Emerson"];
const LAST = ["Bennett", "Carter", "Diaz", "Ellis", "Foster", "Grant", "Hayes", "Ingram", "Jensen", "Keller", "Lawson", "Marsh", "Nolan", "Owens", "Pruitt", "Reyes", "Shaw", "Underwood"];

async function main() {
  console.log("Seeding LAPS…");

  // ---- Users (sales reps) ----
  const mark = await prisma.user.upsert({
    where: { email: "mark@edlerzain.com" },
    update: {},
    create: { email: "mark@edlerzain.com", name: "Mark Edler", role: "ADMIN" },
  });
  const jordan = await prisma.user.upsert({
    where: { email: "jordan@edlerzain.com" },
    update: {},
    create: { email: "jordan@edlerzain.com", name: "Jordan Rivera", role: "REP" },
  });
  const sam = await prisma.user.upsert({
    where: { email: "sam@edlerzain.com" },
    update: {},
    create: { email: "sam@edlerzain.com", name: "Sam Chen", role: "REP" },
  });
  const reps = [mark, jordan, sam];

  // Clean slate for pipeline data (idempotent reseed)
  await prisma.activity.deleteMany();
  await prisma.actionItem.deleteMany();
  await prisma.checklistItem.deleteMany();
  await prisma.handoff.deleteMany();
  await prisma.proposalLineItem.deleteMany();
  await prisma.proposal.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.lead.deleteMany();

  const stages: Stage[] = [
    "NEW", "NEW", "NEW",
    "APPOINTMENT", "APPOINTMENT", "APPOINTMENT",
    "PROPOSAL", "PROPOSAL", "PROPOSAL", "PROPOSAL",
    "CLOSED_WON", "CLOSED_WON", "CLOSED_WON", "CLOSED_WON", "CLOSED_WON",
    "CLOSED_LOST", "CLOSED_LOST",
  ];

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const owner = reps[i % reps.length];
    const first = FIRST[i % FIRST.length];
    const last = LAST[i % LAST.length];
    const company = COMPANIES[i % COMPANIES.length];
    const createdOffset = 90 - i * 4; // spread leads across ~90 days
    const createdAt = daysAgo(createdOffset);

    const lead = await prisma.lead.create({
      data: {
        firstName: first,
        lastName: last,
        companyName: company,
        leadSource: pick(SOURCES),
        email: `${first.toLowerCase()}.${last.toLowerCase()}@${company
          .toLowerCase()
          .replace(/[^a-z]/g, "")}.com`,
        phone: `(${200 + i}) 555-0${100 + i}`,
        stage,
        ownerId: owner.id,
        createdAt,
      },
    });

    // Activity trail
    await prisma.activity.create({
      data: {
        leadId: lead.id,
        userId: owner.id,
        type: "EMAIL_SENT",
        direction: "OUT",
        subject: "Great connecting — next steps",
        body: "Thanks for the time today. Sharing a quick recap and a link to book a call.",
        occurredAt: daysAgo(createdOffset - 1),
      },
    });
    if (i % 2 === 0) {
      await prisma.activity.create({
        data: {
          leadId: lead.id,
          userId: owner.id,
          type: "CALL",
          direction: "OUT",
          subject: "Discovery call",
          body: "15-min intro. Pain: messy books, no monthly reporting. Good fit for CAS.",
          occurredAt: daysAgo(createdOffset - 2),
        },
      });
    }

    // Appointments for anything past NEW
    if (stage !== "NEW") {
      const appt = await prisma.appointment.create({
        data: {
          leadId: lead.id,
          ownerId: owner.id,
          title: `Discovery call — ${company}`,
          scheduledAt: daysAgo(createdOffset - 3),
          durationMin: 30,
          status: stage === "APPOINTMENT" ? "BOOKED" : "COMPLETED",
          notes: "Reviewed current stack and goals.",
        },
      });
      await prisma.actionItem.create({
        data: {
          appointmentId: appt.id,
          leadId: lead.id,
          assigneeId: owner.id,
          description: "Send tailored proposal with scope + pricing",
          dueDate: daysAgo(createdOffset - 5),
          status: stage === "APPOINTMENT" ? "OPEN" : "DONE",
        },
      });
    }

    // Proposals for PROPOSAL / CLOSED_WON / CLOSED_LOST
    if (stage === "PROPOSAL" || stage === "CLOSED_WON" || stage === "CLOSED_LOST") {
      const monthly = 2500 + (i % 5) * 750;
      const status: ProposalStatus =
        stage === "CLOSED_WON" ? "WON" : stage === "CLOSED_LOST" ? "LOST" : pick(["SENT", "VIEWED"] as ProposalStatus[]);
      const sentAt = daysAgo(createdOffset - 6);
      const proposal = await prisma.proposal.create({
        data: {
          leadId: lead.id,
          ownerId: owner.id,
          title: `${company} — CAS Engagement`,
          status,
          estimatedDeliveryCost: monthly * 0.45,
          sentAt,
          wonAt: stage === "CLOSED_WON" ? daysAgo(createdOffset - 9) : null,
          lostAt: stage === "CLOSED_LOST" ? daysAgo(createdOffset - 9) : null,
          lostReason: stage === "CLOSED_LOST" ? "Went with in-house hire" : null,
          lineItems: {
            create: [
              { description: "Monthly bookkeeping & close", quantity: 1, unitPrice: monthly, sortOrder: 0 },
              { description: "Monthly management reporting", quantity: 1, unitPrice: 750, sortOrder: 1 },
              { description: "Onboarding & cleanup (one-time)", quantity: 1, unitPrice: 3500, sortOrder: 2 },
            ],
          },
        },
      });

      // Handoff + onboarding checklist for won deals
      if (stage === "CLOSED_WON") {
        await prisma.handoff.create({
          data: {
            proposalId: proposal.id,
            deliveryStatus: i % 2 === 0 ? "IN_PROGRESS" : "PENDING",
            assignedTo: "Delivery Team",
            checklist: {
              create: ONBOARDING_CHECKLIST_TEMPLATE.map((label, idx) => ({
                label,
                sortOrder: idx,
                done: idx < 2, // first couple already done
                completedAt: idx < 2 ? daysAgo(createdOffset - 10) : null,
              })),
            },
          },
        });
      }
    }
  }

  const counts = {
    users: await prisma.user.count(),
    leads: await prisma.lead.count(),
    appointments: await prisma.appointment.count(),
    proposals: await prisma.proposal.count(),
    activities: await prisma.activity.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
