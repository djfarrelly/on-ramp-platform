# On-Ramp — Phase 2 scope fence (Weeks 9–16)

> Extracted from `onramp-development-plan-draft.md`. Anything not listed
> here is out of scope for this build.

### Phase 2: Build (Weeks 9–16)

**Deliverable 1.2** — Platform Build & Partner Onboarding ($42,000)

**Goals:**
- Build the public-facing four-lane website
- Build the intake form and routing engine
- Build the partner directory with search and map
- Build the routing dashboard (admin-facing)
- Onboard 20-30 partner organizations with populated listings
- **Demo 2 (end of Week 16):** Working platform walkthrough in staging

---

---

## Week-by-week

#### Week 9 — Core Pages & Lane Content
| | |
|---|---|
| **Objectives** | Build out all four lane pages, implement content management |
| **Key Tasks** | • Incorporate Demo 1 feedback — adjust wireframes/architecture as needed<br>• Build all four lane page templates with placeholder content<br>• Implement content management approach (MDX or CMS integration)<br>• Build partner card component (used in directory and lane pages)<br>• Set up content editing workflow for non-technical contributors |
| **Hours** | 18 |
| **Deliverables** | Four lane pages live on staging with placeholder content |

#### Week 10 — Partner Directory (Search & List)
| | |
|---|---|
| **Objectives** | Build the partner directory — search, filter, list view |
| **Key Tasks** | • Build partner directory page with search and lane filtering<br>• Implement full-text search across partner names, descriptions, programs<br>• Build individual partner detail pages (dynamic routes)<br>• Add lane-based filtering and tag system<br>• Build partner data import pipeline (from inventory spreadsheet to DB) |
| **Hours** | 18 |
| **Deliverables** | Searchable partner directory with filtering, partner detail pages |

#### Week 11 — Partner Directory (Map & Polish)
| | |
|---|---|
| **Objectives** | Add map view to directory, begin partner self-service |
| **Key Tasks** | • Integrate map component (Mapbox/Leaflet) with partner locations<br>• Build map + list hybrid view with synchronized interactions<br>• Implement partner self-service login (auth setup)<br>• Build partner profile edit form (name, description, logo, programs, hours)<br>• Geocode partner addresses for map pins |
| **Hours** | 18 |
| **Deliverables** | Map-based directory view, partner self-service login flow |

#### Week 12 — Intake Form & Routing Engine
| | |
|---|---|
| **Objectives** | Build the full intake form and routing engine back-end |
| **Key Tasks** | • Build multi-step intake form with validation and progress indicator<br>• Implement form submission API — save intake records to database<br>• Build routing engine: evaluate intake responses against routing rules<br>• Generate routing results — matched partners/programs ranked by relevance<br>• Implement session tracking (anonymous intake → routing outcome linkage) |
| **Hours** | 20 |
| **Deliverables** | Working intake form → routing engine pipeline, intake records stored in DB |

#### Week 13 — Routing Results & Partner Notifications
| | |
|---|---|
| **Objectives** | Build the results experience and notification layer |
| **Key Tasks** | • Build routing results page — "Based on your answers, here's where to go"<br>• Display matched partners with descriptions, contact info, next steps<br>• Implement email notifications to partners when someone is routed to them (optional/configurable)<br>• Build routing confirmation email to the individual<br>• Add routing outcome tracking — "Did you connect?" follow-up mechanism |
| **Hours** | 18 |
| **Deliverables** | Complete intake → route → results → notification flow |

#### Week 14 — Routing Dashboard (Admin)
| | |
|---|---|
| **Objectives** | Build the admin analytics dashboard |
| **Key Tasks** | • Build admin dashboard layout with auth-gated access<br>• Intake volume metrics: total intakes, by lane, by week/month<br>• Routing distribution: which partners receive the most routing, conversion rates<br>• Build LEO/OFME quarterly report view — exportable summary<br>• Add date range filters and basic data export (CSV) |
| **Hours** | 18 |
| **Deliverables** | Working admin dashboard with intake/routing analytics |

#### Week 15 — Partner Onboarding & Integration
| | |
|---|---|
| **Objectives** | Onboard initial 20-30 partners, populate directory |
| **Key Tasks** | • Finalize partner data for 20-30 organizations<br>• Bulk import partner listings into database<br>• QA each partner listing — data accuracy, map placement, program details<br>• Configure routing rules for all active partners<br>• Test routing engine with realistic intake scenarios across all four lanes<br>• Send partner login credentials, provide self-service documentation |
| **Hours** | 16 |
| **Deliverables** | 20-30 partner listings live, routing rules configured, partners notified |

#### Week 16 — Demo 2 Preparation & Delivery
| | |
|---|---|
| **Objectives** | Polish staging environment, deliver Demo 2 |
| **Key Tasks** | • End-to-end QA: homepage → lane → directory → intake → routing → results<br>• Fix critical bugs and UI polish<br>• Prepare Demo 2 walkthrough script<br>• **Demo 2:** Walk stakeholders through working platform in staging<br>  — Public site with four lanes<br>  — Partner directory with search and map<br>  — Intake form end-to-end<br>  — Routing engine results<br>  — Admin dashboard with sample data<br>• Document feedback and prioritize changes for beta phase |
| **Hours** | 16 |
| **Deliverables** | **Demo 2 delivered** — Working platform walkthrough in staging |

**Phase 2 Total: ~142 hours**

---

