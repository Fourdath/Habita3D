CREATE TABLE "ProjectFloorplan" (
    "projectId" INTEGER NOT NULL,
    "revision" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "svg" TEXT NOT NULL,

    CONSTRAINT "ProjectFloorplan_pkey" PRIMARY KEY ("projectId"),
    CONSTRAINT "ProjectFloorplan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
