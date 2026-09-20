-- CreateTable
CREATE TABLE "Brochure" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "headline" TEXT,
    "intro" TEXT,
    "stats" JSONB NOT NULL,
    "caseStudies" JSONB NOT NULL,
    "testimonials" JSONB NOT NULL,
    "linkedinPosts" JSONB NOT NULL,
    "isPlaceholder" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brochure_pkey" PRIMARY KEY ("id")
);

