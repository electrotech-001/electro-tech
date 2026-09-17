"use client";

import Image from "next/image";
import { ProjectCards } from "./project-cards";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  Mail,
  MessageCircle,
  Phone,
  Sun,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { siteConfig, type ServiceName } from "@/lib/site-config";
import { apiUrl } from "@/lib/api-origin";
import { analyzerLeadMessage, consumeAnalyzerLeadContext } from "@/lib/solar-analyzer";
import { QuoteInput, quoteSchema } from "@/lib/validation";

const navItems = [
  ["About", "#about"],
  ["Services", "#services"],
  ["Projects", "#projects"],
  ["Process", "#process"],
  ["Contact", "#contact"],
] as const;

const solarContent = {
  Hybrid: {
    eyebrow: "FLEXIBLE CONTINUITY",
    title: "Hybrid Solar System",
    description: "Solar, battery storage, and the grid work seamlessly together in one adaptable configuration.",
    descriptor: "SOLAR + STORAGE + GRID",
    badge: "HYBRID SYSTEM",
    battery: true,
    grid: true,
  },
  "On-Grid": {
    eyebrow: "DIRECT CONNECTION",
    title: "On-Grid Solar System",
    description: "Solar generation directly offsets grid electricity during peak daytime consumption hours.",
    descriptor: "SOLAR + GRID",
    badge: "ON-GRID SYSTEM",
    battery: false,
    grid: true,
  },
  "Off-Grid": {
    eyebrow: "INDEPENDENT SUPPLY",
    title: "Off-Grid Solar System",
    description: "Solar generation and dedicated battery storage support the property without any grid connection.",
    descriptor: "SOLAR + STORAGE",
    badge: "OFF-GRID SYSTEM",
    battery: true,
    grid: false,
  },
} as const;

type SolarType = keyof typeof solarContent;

const billRanges = [
  "Under PKR 25,000",
  "PKR 25,000–50,000",
  "PKR 50,000–100,000",
  "PKR 100,000+",
  "Prefer not to say",
] as const;

const technologies = [
  { name: "Inverex", src: "/brands/inverex.png" },
  { name: "Solis", src: "/brands/solis-light.png" },
  { name: "Tesla Industries", src: "/brands/tesla-light.png" },
  { name: "Growatt", src: "/brands/growatt-light.png" },
  { name: "CoreTECH", src: "/brands/coretech.png" },
  { name: "itel", src: "/brands/itel.svg" },
] as const;

const footerCompany = [
  ["About", "#about"],
  ["Projects", "#projects"],
  ["Process", "#process"],
  ["Contact", "#contact"],
] as const;

const footerSolutions = [
  ["Solar Systems", "#solar"],
  ["Solar Structures", "#services"],
  ["Electrical Works", "#services"],
  ["Security Systems", "#services"],
] as const;

function LinkIcon({ direction = "up-right" }: { direction?: "up-right" | "right" }) {
  const Icon = direction === "right" ? ArrowRight : ArrowUpRight;
  return <Icon className="link-icon" size={16} strokeWidth={1.8} aria-hidden="true" />;
}

function WhatsAppIcon({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#25D366"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9" />
      <path d="M9 10a.5 .5 0 0 0 1 0v-1a.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a.5 .5 0 0 0 0 -1h-1a.5 .5 0 0 0 0 1" />
    </svg>
  );
}

function SectionIntro({
  label,
  title,
  copy,
}: {
  label: string;
  title: string;
  copy?: string;
}) {
  return (
    <div className="section-intro">
      <p className="eyebrow">{label}</p>
      <h2>{title}</h2>
      {copy ? <p className="section-copy">{copy}</p> : null}
    </div>
  );
}

function SolarPanelIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polygon points="3 17 6 5 18 5 21 17 3 17" />
      <line x1="12" y1="5" x2="12" y2="17" />
      <line x1="4.5" y1="11" x2="19.5" y2="11" />
      <line x1="7" y1="17" x2="5" y2="21" />
      <line x1="17" y1="17" x2="19" y2="21" />
      <line x1="5" y1="21" x2="19" y2="21" />
    </svg>
  );
}

function InverterIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <rect x="7.5" y="6" width="9" height="4" rx="1" strokeWidth="1.5" />
      <path d="M7.5 15c1.2-1.8 2.4-1.8 3.6 0s2.4 1.8 3.6 0" />
      <circle cx="9" cy="18" r="0.75" fill="currentColor" />
      <circle cx="12" cy="18" r="0.75" fill="currentColor" />
      <circle cx="15" cy="18" r="0.75" fill="currentColor" />
    </svg>
  );
}

function PropertyIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20v-9.5z" />
      <path d="M9.5 21v-6.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V21" fill="rgba(212, 160, 23, 0.25)" stroke="#9A7500" strokeWidth="1.5" />
    </svg>
  );
}

function BatteryIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2" y="7" width="16" height="11" rx="2" />
      <path d="M19 10.5v4" strokeLinecap="round" />
      <rect x="5" y="9.5" width="7" height="6" rx="1" fill="#D4A017" stroke="none" />
    </svg>
  );
}

function GridTowerIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7 21l3.5-17h3L17 21" />
      <line x1="6" y1="7" x2="18" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="8.5" y1="12" x2="14" y2="17" />
      <line x1="15.5" y1="12" x2="10" y2="17" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  );
}

function ArchitectureDiagram({ active }: { active: SolarType }) {
  const isBatteryActive = active === "Hybrid" || active === "Off-Grid";
  const isGridActive = active === "Hybrid" || active === "On-Grid";
  const details = solarContent[active];

  return (
    <div className="architecture-card" aria-label={`${active} solar architecture diagram`}>
      <div className="architecture-card-header">
        <span className="architecture-descriptor">{details.descriptor}</span>
        <span className="architecture-pill">
          <span className="pill-dot" aria-hidden="true" />
          {details.badge}
        </span>
      </div>

      <div className="architecture-canvas">
        {/* Node 1: Sun */}
        <div className="diagram-node node-sun">
          <div className="node-icon-card sun-card" aria-hidden="true">
            <Sun size={22} strokeWidth={1.8} />
          </div>
          <div className="node-text-block">
            <div className="node-title">Sun</div>
            <div className="node-subtitle">Renewable energy source</div>
          </div>
        </div>

        {/* Spine Connector: Sun -> Solar panels */}
        <div className="spine-connector" aria-hidden="true">
          <svg width="2" height="22" viewBox="0 0 2 22" fill="none">
            <line x1="1" y1="0" x2="1" y2="22" className="connector-line active" />
          </svg>
        </div>

        {/* Node 2: Solar panels */}
        <div className="diagram-node node-panels">
          <div className="node-icon-card" aria-hidden="true">
            <SolarPanelIcon size={22} />
          </div>
          <div className="node-text-block">
            <div className="node-title">Solar panels</div>
            <div className="node-subtitle">Convert sunlight to DC electricity</div>
          </div>
        </div>

        {/* Spine Connector: Solar panels -> Inverter */}
        <div className="spine-connector" aria-hidden="true">
          <svg width="2" height="22" viewBox="0 0 2 22" fill="none">
            <line x1="1" y1="0" x2="1" y2="22" className="connector-line active" />
          </svg>
        </div>

        {/* Node 3: Inverter */}
        <div className="diagram-node node-inverter">
          <div className="node-icon-card" aria-hidden="true">
            <InverterIcon size={22} />
          </div>
          <div className="node-text-block">
            <div className="node-title">Inverter</div>
            <div className="node-subtitle">Converts DC to AC for your property</div>
          </div>
        </div>

        {/* Spine Connector: Inverter -> Property */}
        <div className="spine-connector" aria-hidden="true">
          <svg width="2" height="22" viewBox="0 0 2 22" fill="none">
            <line x1="1" y1="0" x2="1" y2="22" className="connector-line active" />
          </svg>
        </div>

        {/* Node 4: Property (Emphasized Destination Node) */}
        <div className="diagram-node node-property">
          <div className="node-icon-card property-card" aria-hidden="true">
            <PropertyIcon size={24} />
          </div>
          <div className="node-text-block">
            <div className="node-title">Property</div>
            <div className="node-subtitle">Powers your home and appliances</div>
          </div>
        </div>

        {/* Branch Connector: Property -> Battery & Grid */}
        <div className="branch-connector-wrap" aria-hidden="true">
          <svg viewBox="0 0 400 38" preserveAspectRatio="none" className="branch-svg" fill="none">
            <path
              d="M 200 0 L 200 10 Q 200 19 191 19 L 109 19 Q 100 19 100 28 L 100 38"
              className={`connector-line ${isBatteryActive ? "active" : "inactive"}`}
            />
            <path
              d="M 200 0 L 200 10 Q 200 19 209 19 L 291 19 Q 300 19 300 28 L 300 38"
              className={`connector-line ${isGridActive ? "active" : "inactive"}`}
            />
          </svg>
        </div>

        {/* Bottom Row: Battery (left) & Grid (right) */}
        <div className="architecture-bottom-row">
          <div className={`diagram-node node-battery ${isBatteryActive ? "node-active" : "node-muted"}`}>
            <div className="node-icon-card" aria-hidden="true">
              <BatteryIcon size={22} />
            </div>
            <div className="node-text-block">
              <div className="node-title">Battery</div>
              <div className="node-subtitle">Stores excess energy for later use</div>
            </div>
          </div>

          <div className={`diagram-node node-grid ${isGridActive ? "node-active" : "node-muted"}`}>
            <div className="node-icon-card" aria-hidden="true">
              <GridTowerIcon size={22} />
            </div>
            <div className="node-text-block">
              <div className="node-title">Grid</div>
              <div className="node-subtitle">Provides backup power and enables energy export</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ServiceItem {
  id: "solar" | "electrical" | "security";
  number: string;
  badge: string;
  title: string;
  quoteService: ServiceName;
  image: string;
  imageAlt: string;
  shortDesc: string;
  extendedDesc: string;
  specs: string[];
  ctaLabel: string;
  iconType: "zap" | "shield";
}

const servicesList: ServiceItem[] = [
  {
    id: "solar",
    number: "01",
    badge: "PRIMARY SOLUTION",
    title: "Solar Systems",
    quoteService: "Solar Energy",
    image: "/images/solar-energy-solutions.webp",
    imageAlt: "Solar energy solutions rooftop solar panel installation",
    shortDesc:
      "Complete rooftop and ground-mounted solar energy systems engineered for maximum yield, long-term durability, and rapid return on investment.",
    extendedDesc:
      "Custom-engineered solar configurations tailored to residential estates, commercial facilities, and industrial compounds across Punjab and Khyber Pakhtunkhwa. We handle comprehensive shading analysis, tier-1 panel mounting, net-metering regulatory approvals, and battery storage integration.",
    specs: [
      "On-Grid Direct Connection with Net-Metering",
      "Hybrid Battery Storage with Zero Load-Shedding",
      "Off-Grid Independent Rural Supply",
      "5 kW to 1 MW Commercial & Industrial Capacities",
    ],
    ctaLabel: "Discuss Solar Systems",
    iconType: "zap",
  },
  {
    id: "electrical",
    number: "02",
    badge: "INFRASTRUCTURE",
    title: "Solar Structures & Electrical",
    quoteService: "Solar Structures",
    image: "/images/electrical-works.webp",
    imageAlt: "Electrical works distribution panel and solar structural engineering",
    shortDesc:
      "Industrial structural fabrication and distribution engineering ensuring structural integrity and code-compliant electrical distribution.",
    extendedDesc:
      "Precision-welded galvanized H-beam and elevated rooftop structures designed for industrial sheds, commercial rooftops, and high-wind zones, integrated with complete low-voltage distribution panels, automatic changeover systems (ATS), and certified earthing infrastructure.",
    specs: [
      "Heavy-Duty Galvanized H-Beam Solar Framing",
      "Automatic (ATS) & Manual Main Distribution Panels",
      "Single-Phase & Three-Phase Distribution Works",
      "Industrial Surge Protection (SPD) & Certified Earthing",
    ],
    ctaLabel: "Discuss Electrical & Structures",
    iconType: "shield",
  },
  {
    id: "security",
    number: "03",
    badge: "SECURITY",
    title: "Security Systems",
    quoteService: "Security Systems",
    image: "/images/cctv-security-solutions.webp",
    imageAlt: "CCTV and security systems monitoring equipment",
    shortDesc:
      "Professional security and monitoring infrastructure for residential, commercial, and institutional premises.",
    extendedDesc:
      "Enterprise-grade perimeter surveillance, smart analytics, and multi-zone access control for residential complexes, commercial plazas, and industrial warehouses. Equipped with high-definition optical clarity, remote mobile streaming, and power-redundant battery/solar backup.",
    specs: [
      "4K Ultra-HD IP & Analog CCTV Deployment",
      "Remote Smartphone & Multi-Display Monitoring",
      "Premises Access Control & Video Intercoms",
      "UPS & Solar-Backed Surveillance Power Continuity",
    ],
    ctaLabel: "Discuss Security Systems",
    iconType: "shield",
  },
];

export function ElectroTechSite() {
  const reducedMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [solarType, setSolarType] = useState<SolarType>("Hybrid");
  const [activeService, setActiveService] = useState<string | null>(null);
  const [propertyType, setPropertyType] = useState("Home");
  const [startingBill, setStartingBill] = useState<(typeof billRanges)[number]>("PKR 25,000–50,000");
  const [startingSystem, setStartingSystem] = useState<SolarType | "Not Sure">("Hybrid");
  const [submitState, setSubmitState] = useState<"idle" | "success" | "error">("idle");
  const [serverMessage, setServerMessage] = useState("");
  const [whatsappHandoff, setWhatsappHandoff] = useState("");
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const lastScrollY = useRef(0);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<QuoteInput>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      city: "",
      service: "Solar Energy",
      email: "",
      company: "",
      propertyType: "Home",
      systemType: "Hybrid",
      requiredCapacity: "",
      monthlyBillRange: "PKR 25,000–50,000",
      message: "",
      website: "",
    },
  });

  const selectedService = useWatch({ control, name: "service" });

  useEffect(() => {
    const onScroll = () => {
      const currentScrollY = window.scrollY;
      setScrolled(currentScrollY > 20);

      if (currentScrollY <= 40) {
        setHeaderVisible(true);
      } else if (currentScrollY > lastScrollY.current + 6) {
        // Scrolling down -> hide header
        setHeaderVisible(false);
      } else if (currentScrollY < lastScrollY.current - 6) {
        // Scrolling up -> show header
        setHeaderVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menuOpen) {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    if (search.get("source") !== "solar_bill_analyzer") return;
    const context = consumeAnalyzerLeadContext();
    if (!context) return;
    const systemType = context.recommendedArchitecture.includes("Off-Grid")
      ? "Off-Grid"
      : context.recommendedArchitecture.includes("Hybrid")
        ? "Hybrid"
        : "On-Grid";
    setValue("service", "Solar Energy", { shouldValidate: true });
    setValue("systemType", systemType, { shouldValidate: true });
    setValue("city", context.city, { shouldValidate: true });
    setValue("requiredCapacity", `${context.pvCapacityKwp} kWp preliminary`, { shouldValidate: true });
    setValue("message", analyzerLeadMessage(context), { shouldValidate: true });
    setValue("analyzerContext", context, { shouldValidate: true });
  }, [setValue]);

  function scrollToSection(targetId: string) {
    const id = targetId.replace(/^#/, "");
    const element = document.getElementById(id);
    if (element) {
      const offset = 40;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      window.scrollTo({
        top: offsetPosition,
        behavior: reducedMotion ? "auto" : "smooth",
      });
    }
  }

  const handleToggleService = (id: string) => {
    setActiveService((prev) => (prev === id ? null : id));
  };

  const handleDiscussService = (serviceName: ServiceName) => {
    setValue("service", serviceName, { shouldValidate: true });
    scrollToSection("contact");
  };

  function continueToQuote() {
    setValue("service", "Solar Energy", { shouldValidate: true });
    setValue("propertyType", propertyType as "Home" | "Business" | "Institution" | "Other", { shouldValidate: true });
    setValue("monthlyBillRange", startingBill, { shouldValidate: true });
    setValue("systemType", startingSystem, { shouldValidate: true });
    scrollToSection("contact");
    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>("#fullName");
      if (input) {
        input.focus({ preventScroll: true });
      }
    }, reducedMotion ? 0 : 450);
  }

  async function submitQuote(values: QuoteInput) {
    setSubmitState("idle");
    setServerMessage("");
    setWhatsappHandoff("");
    try {
      const response = await fetch(apiUrl("/api/quote"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = (await response.json()) as {
        message?: string;
        handoff?: { channel?: string; message?: string };
      };
      if (result.handoff?.channel === "whatsapp" && result.handoff.message) {
        setWhatsappHandoff(
          `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(result.handoff.message)}`,
        );
      }
      if (!response.ok) throw new Error(result.message || "Submission failed");
      setServerMessage(result.message || "Your request has been sent successfully.");
      setSubmitState("success");
      reset();
    } catch (error) {
      setSubmitState("error");
      setServerMessage(error instanceof Error ? error.message : "We couldn't submit your enquiry. Please try again.");
    }
  }

  const motionProps = reducedMotion
    ? {}
    : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 } };

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className={`site-header ${scrolled ? "is-scrolled" : ""} ${!headerVisible && !menuOpen ? "is-hidden" : ""} ${menuOpen ? "has-open-menu" : ""}`}>
        <div className="header-inner">
          <a className="brand" href="#home" onClick={(e) => { e.preventDefault(); scrollToSection("home"); }} aria-label="Electro Tech home">
            <Image src="/logos/electrotech-horizontal.png" width={407} height={112} alt="Electro Tech — Electrical & Solar Solutions" priority />
          </a>
          <nav className="desktop-nav" aria-label="Primary navigation">
            {navItems.map(([label, href]) => (
              <a key={href} href={href} onClick={(e) => { e.preventDefault(); scrollToSection(href); }}>
                {label}
              </a>
            ))}
          </nav>
          <a className="button button-dark header-pill-cta" href="#contact" onClick={(e) => { e.preventDefault(); scrollToSection("contact"); }}>
            Request a Solar Quote <ArrowUpRight size={15} className="link-icon" aria-hidden="true" />
          </a>
          <button ref={menuButtonRef} className="menu-button" type="button" aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen((open) => !open)}>
            <span /><span />
          </button>
        </div>
        <AnimatePresence>
          {menuOpen ? (
            <motion.nav id="mobile-menu" className="mobile-nav" aria-label="Mobile navigation" initial={reducedMotion ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              {navItems.map(([label, href]) => (
                <a key={href} href={href} onClick={() => { setMenuOpen(false); scrollToSection(href); }}>
                  {label}<LinkIcon />
                </a>
              ))}
              <a className="button button-dark mobile-cta" href="#contact" onClick={(e) => { e.preventDefault(); setMenuOpen(false); scrollToSection("contact"); }}>
                Request a Solar Quote <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </motion.nav>
          ) : null}
        </AnimatePresence>
      </header>

      <main id="main-content">
        {/* HERO SECTION (16:9 Architectural Composition) */}
        <section id="home" className="hero-shell section-shell" aria-label="Introduction">
          <div className="hero-canvas">
            <div className="hero-visual-bg">
              <Image
                src="/images/hero-solar-architectural.webp"
                alt="Modern solar-powered residence with sleek rooftop photovoltaic panels"
                fill
                priority
                sizes="(max-width: 1440px) 100vw, 1380px"
                className="hero-image-cover"
              />
              <div className="hero-gradient-overlay" aria-hidden="true" />
            </div>

            {/* Upper-left Hero Content Overlay */}
            <div className="hero-overlay-content">
              <motion.h1 className="hero-headline" {...motionProps} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
                Powering Progress<br />
                With Smarter Energy
              </motion.h1>

              <motion.p className="hero-description" {...motionProps} transition={{ duration: 0.55, delay: reducedMotion ? 0 : 0.08 }}>
                Complete solar and electrical solutions engineered for homes, businesses, and institutions.
              </motion.p>

              <motion.div className="hero-actions-wrap" {...motionProps} transition={{ duration: 0.5, delay: reducedMotion ? 0 : 0.16 }}>
                <a className="button hero-white-pill" href="#contact" onClick={(e) => { e.preventDefault(); scrollToSection("contact"); }}>
                  Get a Solar Quote <ArrowRight size={15} className="link-icon" aria-hidden="true" />
                </a>
              </motion.div>
            </div>

            {/* Bottom-left Floating Credibility Card */}
            <motion.div
              className="hero-credibility-card"
              initial={reducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: reducedMotion ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="credibility-header">
                <strong>5 kW–1 MW</strong>
                <span className="credibility-icon" aria-hidden="true"><Sun size={15} strokeWidth={2.2} /></span>
              </div>
              <span className="credibility-label">Solar System Capacity</span>
              <span className="credibility-sub">On-Grid · Hybrid · Off-Grid</span>
            </motion.div>
          </div>
        </section>

        {/* FACTS METRIC STRIP */}
        <section className="facts section-shell" aria-label="Electro Tech key facts">
          <div><strong>Since 2019</strong><p>Established electrical and solar engineering solutions.</p></div>
          <div><strong>5 kW–1 MW</strong><p>Scalable solar installations for residential & commercial.</p></div>
          <div><strong>On-Grid / Hybrid / Off-Grid</strong><p>Configurations customized for energy independence.</p></div>
        </section>

        {/* ABOUT SECTION */}
        <section id="about" className="about section-shell section-pad">
          <div className="about-copy">
            <SectionIntro label="ABOUT ELECTRO TECH" title="Energy solutions built around real requirements." />
            <p>Since 2019, Electro Tech has provided integrated solar and electrical solutions for homes, businesses, and institutions.</p>
            <p className="about-focus">Solar is our <span>primary focus.</span></p>
            <ul className="about-points">
              <li><b>Since 2019</b><span>Established track record</span></li>
              <li><b>Solar + Electrical</b><span>Integrated engineering</span></li>
              <li><b>5 kW–1 MW</b><span>Scalable system range</span></li>
              <li><b>Homes / Businesses / Institutions</b><span>Project types</span></li>
            </ul>
            <div className="about-tag-wrap">
              <span className="about-tag">Measured. Installed. Supported.</span>
            </div>
          </div>
          <div className="about-images">
            <div className="about-image-primary">
              <Image src="/images/solar-technician.webp" alt="Solar technician completing a high-precision rooftop installation" fill sizes="(max-width: 800px) 90vw, 42vw" />
            </div>
            <div className="about-image-secondary">
              <Image src="/images/electrical-panel.webp" alt="Electrician working on an industrial distribution panel" fill sizes="(max-width: 800px) 55vw, 22vw" />
            </div>
          </div>
        </section>

        {/* SYSTEM ARCHITECTURE INTERACTIVE EXPLAINER */}
        <section id="solar" className="solar-section section-pad">
          <div className="section-shell">
            <div className="solar-layout">
              <div className="solar-controls">
                <div className="solar-heading-wrap">
                  <p className="eyebrow">SYSTEM ARCHITECTURE</p>
                  <h2>Choose the solar system that fits your energy needs.</h2>
                  <p className="section-copy">Explore how each configuration connects solar generation to your property.</p>
                </div>
                <div className="solar-tabs" role="tablist" aria-label="Solar system type">
                  {(Object.keys(solarContent) as SolarType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      role="tab"
                      aria-selected={solarType === type}
                      className={`solar-tab-btn ${solarType === type ? "active" : ""}`}
                      onClick={() => setSolarType(type)}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={solarType}
                    className="solar-description"
                    initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <p className="eyebrow">{solarContent[solarType].eyebrow}</p>
                    <h3>{solarContent[solarType].title}</h3>
                    <p>{solarContent[solarType].description}</p>
                    <a
                      className="solar-cta desktop-only"
                      href="#contact"
                      onClick={(e) => { e.preventDefault(); scrollToSection("contact"); }}
                    >
                      Discuss this system <LinkIcon />
                    </a>
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="solar-diagram-column">
                <ArchitectureDiagram active={solarType} />
                <a
                  className="solar-cta mobile-only"
                  href="#contact"
                  onClick={(e) => { e.preventDefault(); scrollToSection("contact"); }}
                >
                  Discuss this system <LinkIcon />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* SOLAR BILL ANALYZER CTA */}
        <section className="analyzer-cta section-shell" aria-labelledby="analyzer-cta-title">
          <div>
            <p className="eyebrow">CONSUMPTION-BASED STARTING POINT</p>
            <h2 id="analyzer-cta-title">Not sure which system fits your usage?</h2>
            <p>Upload your electricity bill and get a preliminary solar recommendation based on your actual consumption.</p>
          </div>
          <a className="button button-primary" href="/solar-bill-analyzer">Analyze My Electricity Bill <LinkIcon direction="right" /></a>
        </section>

        {/* SOLAR QUESTIONNAIRE */}
        <section id="solar-start" className="starting section-shell section-pad">
          <div className="starting-heading">
            <SectionIntro
              label="A SIMPLE FIRST STEP"
              title="Find your solar starting point."
              copy="Share a few project details so Electro Tech can better understand your requirements."
            />
          </div>
          <div className="starting-form" aria-label="Solar starting point questionnaire">
            <fieldset>
              <legend>1. Property type</legend>
              <div className="choice-row">
                {["Home", "Business", "Institution", "Other"].map((value) => (
                  <button key={value} type="button" className={propertyType === value ? "active" : ""} onClick={() => setPropertyType(value)} aria-pressed={propertyType === value}>
                    {value}
                  </button>
                ))}
              </div>
            </fieldset>
            <label>
              2. Monthly electricity bill
              <select value={startingBill} onChange={(event) => setStartingBill(event.target.value as (typeof billRanges)[number])}>
                {billRanges.map((range) => (
                  <option key={range}>{range}</option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>3. System preference</legend>
              <div className="choice-row">
                {["On-Grid", "Hybrid", "Off-Grid", "Not Sure"].map((value) => (
                  <button key={value} type="button" className={startingSystem === value ? "active" : ""} onClick={() => setStartingSystem(value as SolarType | "Not Sure")} aria-pressed={startingSystem === value}>
                    {value}
                  </button>
                ))}
              </div>
            </fieldset>
            <button className="button button-primary starting-submit" type="button" onClick={continueToQuote}>
              Continue to Solar Quote <LinkIcon direction="right" />
            </button>
          </div>
        </section>

        {/* SERVICES SECTION */}
        <section id="services" className="services-section section-shell section-pad">
          <SectionIntro
            label="SERVICES"
            title="Solutions built around your energy needs"
            copy="Electro Tech provides complete solar, electrical, structural, and security solutions for residential, commercial, and institutional requirements."
          />
          <div className={`services-presentation ${activeService ? "has-expanded-service" : "all-collapsed"}`}>
            {servicesList.map((service) => {
              const isExpanded = activeService === service.id;
              return (
                <article
                  key={service.id}
                  id={`service-card-${service.id}`}
                  data-service={service.id}
                  className={`service-feature-card service-card-${service.id} ${isExpanded ? "is-expanded" : "is-collapsed"}`}
                >
                  {isExpanded ? (
                    <div
                      id={`service-details-${service.id}`}
                      role="region"
                      aria-labelledby={`service-toggle-${service.id}`}
                      className="service-card-expanded"
                    >
                      <div className="service-feature-visual expanded-visual">
                        <Image
                          src={service.image}
                          alt={service.imageAlt}
                          fill
                          sizes="(max-width: 900px) 100vw, 45vw"
                          className="service-feature-img"
                        />
                        <span className="service-badge">{service.badge}</span>
                      </div>
                      <div className="service-feature-body expanded-body">
                        <div className="service-header-row">
                          <span className="service-number">{service.number}</span>
                          <span className="service-badge-inline">{service.badge}</span>
                        </div>
                        <h3>{service.title}</h3>
                        <p className="service-desc">{service.shortDesc}</p>
                        <p className="service-desc-extended">{service.extendedDesc}</p>
                        <ul className="service-spec-list">
                          {service.specs.map((spec) => (
                            <li key={spec}>
                              {service.iconType === "zap" ? (
                                <Zap size={14} aria-hidden="true" />
                              ) : (
                                <ShieldCheck size={14} aria-hidden="true" />
                              )}
                              <span>{spec}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="service-card-action expanded-action-row">
                          <a
                            className="button button-primary"
                            href="#contact"
                            onClick={(e) => {
                              e.preventDefault();
                              handleDiscussService(service.quoteService);
                            }}
                          >
                            {service.ctaLabel} <LinkIcon />
                          </a>
                          <button
                            type="button"
                            className="service-toggle-btn collapse-toggle-btn"
                            aria-expanded={true}
                            aria-controls={`service-details-${service.id}`}
                            onClick={() => handleToggleService(service.id)}
                          >
                            <span>Show less</span>
                            <ArrowUp size={15} strokeWidth={2} aria-hidden="true" className="toggle-arrow" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="service-card-compact">
                      <div className="service-feature-visual compact-visual">
                        <Image
                          src={service.image}
                          alt={service.imageAlt}
                          fill
                          sizes="(max-width: 900px) 100vw, (max-width: 1200px) 50vw, 33vw"
                          className="service-feature-img"
                        />
                        <span className="service-badge">{service.badge}</span>
                      </div>
                      <div className="service-feature-body compact-body">
                        <div className="service-header-row">
                          <span className="service-number">{service.number}</span>
                          <h3>{service.title}</h3>
                        </div>
                        <p className="service-desc">{service.shortDesc}</p>
                        <div className="service-card-action compact-action">
                          <button
                            type="button"
                            className="service-toggle-btn"
                            aria-expanded={false}
                            aria-controls={`service-details-${service.id}`}
                            id={`service-toggle-${service.id}`}
                            onClick={() => handleToggleService(service.id)}
                          >
                            <span>View details</span>
                            <ArrowRight size={15} strokeWidth={2} aria-hidden="true" className="toggle-arrow" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}

            {/* Featured Digital Tool — Solar Bill Analyzer */}
            <article className="service-feature-card analyzer-tool-card is-collapsed" data-service="analyzer">
              <div className="service-card-compact">
                <div className="service-feature-visual compact-visual">
                  <Image
                    src="/images/ai-solar-bill-analyzer.webp"
                    alt="AI-assisted electricity bill analysis for solar system recommendation"
                    fill
                    sizes="(max-width: 900px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="service-feature-img analyzer-feature-img"
                  />
                  <span className="service-badge analyzer-badge">DIGITAL SOLAR TOOL</span>
                </div>
                <div className="service-feature-body compact-body analyzer-body">
                  <div className="service-header-row">
                    <span className="service-number">04</span>
                    <h3>AI Solar Bill Analyzer</h3>
                  </div>
                  <p className="service-desc">
                    Upload your electricity bill and get a preliminary solar system recommendation based on your actual energy consumption.
                  </p>
                  <div className="service-card-action compact-action analyzer-action">
                    <a className="service-direct-link" href="/solar-bill-analyzer">
                      Analyze My Bill <ArrowRight size={15} strokeWidth={2} aria-hidden="true" className="toggle-arrow" />
                    </a>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>

        {/* TECHNOLOGY WE WORK WITH (Section 1 - Positioned immediately after Services) */}
        <section id="technology" className="technology-section section-shell section-pad">
          <div className="technology-header">
            <SectionIntro
              label="EQUIPMENT EXPERIENCE"
              title="Technology We Work With"
              copy="Equipment selection may vary according to system requirements, availability, and project specifications."
            />
          </div>
          <div className="tech-strip" aria-label="Technology brands Electro Tech works with">
            {technologies.map((technology) => (
              <div className="tech-cell" key={technology.name}>
                <div className="tech-logo-wrap">
                  <Image src={technology.src} width={260} height={70} alt={`${technology.name} logo`} sizes="(max-width: 520px) 45vw, 180px" unoptimized />
                </div>
                <span className="tech-name">{technology.name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* PROJECTS */}
        <section id="projects" className="projects section-shell section-pad">
          <SectionIntro label="OUR WORK" title="Selected projects" copy="Solar installations for homes, businesses, and institutions across Attock." />
          <ProjectCards />
        </section>

        {/* PROCESS */}
        <section id="process" className="process section-shell section-pad">
          <SectionIntro label="HOW WE WORK" title="From first conversation to final installation." />
          <div className="process-photo">
            <Image src="/images/solar-technician.webp" alt="Solar installation professional completing rooftop work" fill sizes="100vw" />
          </div>
          <ol className="process-list">
            {[
              ["Consultation", "Understand energy requirements and structural feasibility."],
              ["Site Assessment", "Inspect electrical infrastructure and solar radiation access."],
              ["System Design", "Engineer the optimal inverter, battery, and panel topology."],
              ["Installation", "Execute precise mechanical mounting and electrical integration."],
              ["Support", "Provide ongoing monitoring, warranty service, and support."],
            ].map(([title, copy], index) => (
              <li key={title}>
                <span>0{index + 1}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* CONTACT / QUOTE FORM */}
        <section id="contact" className="contact section-pad">
          <div className="section-shell contact-layout">
            <div className="contact-copy">
              <p className="eyebrow">START YOUR PROJECT</p>
              <h2>Ready to explore solar for your property?</h2>
              <p>Tell us about your project and Electro Tech can review your requirements and discuss the appropriate next step.</p>
              <div className="contact-details">
                <a href={siteConfig.phoneHref}><Phone aria-hidden="true" /><span>Call</span><strong>{siteConfig.phoneDisplay}</strong></a>
                <a href={siteConfig.whatsappHref} target="_blank" rel="noreferrer"><MessageCircle aria-hidden="true" /><span>WhatsApp</span><strong>{siteConfig.phoneDisplay}</strong></a>
                <a href={`mailto:${siteConfig.email}`}><Mail aria-hidden="true" /><span>Email</span><strong>{siteConfig.email}</strong></a>
              </div>
            </div>
            <div className="quote-panel">
              {submitState === "success" ? (
                <div className="success-state" role="status">
                  <span><Check size={25} strokeWidth={2} aria-hidden="true" /></span>
                  <h3>Thanks — your request has been sent.</h3>
                  <p>{serverMessage} No quote details were stored by the website.</p>
                  <div>
                    <a className="button button-primary" href={whatsappHandoff || siteConfig.whatsappHref} target="_blank" rel="noopener noreferrer">
                      <MessageCircle size={17} aria-hidden="true" /> Also Send via WhatsApp
                    </a>
                    <a className="text-link" href={siteConfig.phoneHref}>Call Electro Tech <LinkIcon /></a>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit(submitQuote)} noValidate>
                  <div className="form-heading">
                    <span>PROJECT ENQUIRY</span>
                    <h3>Tell us what you need.</h3>
                  </div>
                  {Object.keys(errors).length > 0 ? <div className="error-summary" role="alert">Please review the highlighted fields.</div> : null}
                  <div className="form-grid">
                    <label>Full Name *<input id="fullName" autoComplete="name" {...register("fullName")} aria-invalid={Boolean(errors.fullName)} />{errors.fullName ? <small>{errors.fullName.message}</small> : null}</label>
                    <label>Phone / WhatsApp *<input inputMode="tel" autoComplete="tel" {...register("phone")} aria-invalid={Boolean(errors.phone)} />{errors.phone ? <small>{errors.phone.message}</small> : null}</label>
                    <label>City / Project Location *<input autoComplete="address-level2" {...register("city")} aria-invalid={Boolean(errors.city)} />{errors.city ? <small>{errors.city.message}</small> : null}</label>
                    <label>Required Service *<select {...register("service")}>{siteConfig.services.map((service) => <option key={service}>{service}</option>)}</select>{errors.service ? <small>{errors.service.message}</small> : null}</label>
                    <label>Email<input type="email" autoComplete="email" {...register("email")} />{errors.email ? <small>{errors.email.message}</small> : null}</label>
                    <label>Company / Organization<input autoComplete="organization" {...register("company")} /></label>
                    {selectedService === "Solar Energy" ? (
                      <>
                        <label>Property Type *<select {...register("propertyType")}><option>Home</option><option>Business</option><option>Institution</option><option>Other</option></select>{errors.propertyType ? <small>{errors.propertyType.message}</small> : null}</label>
                        <label>Preferred System *<select {...register("systemType")}><option>Hybrid</option><option>On-Grid</option><option>Off-Grid</option><option>Not Sure</option></select>{errors.systemType ? <small>{errors.systemType.message}</small> : null}</label>
                        <label>Monthly Electricity Bill<select {...register("monthlyBillRange")}><option value="">Select a PKR range</option>{billRanges.map((range) => <option key={range}>{range}</option>)}</select></label>
                        <label>Required Capacity, if known<input placeholder="e.g. 10 kW" {...register("requiredCapacity")} /></label>
                      </>
                    ) : null}
                    <label className="full-field">Message<textarea rows={3} {...register("message")} /></label>
                    <label className="honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" {...register("website")} /></label>
                  </div>
                  {submitState === "error" ? <p className="submit-error" role="alert">{serverMessage}</p> : null}
                  <div className="form-actions">
                    <button className="button button-primary" type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "Sending…" : "Request My Quote"} <LinkIcon />
                    </button>
                    <a className="text-link" href={whatsappHandoff || siteConfig.whatsappHref} target="_blank" rel="noopener noreferrer">
                      <MessageCircle size={17} strokeWidth={1.8} aria-hidden="true" /> Send via WhatsApp <LinkIcon />
                    </a>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* FINAL PRE-FOOTER CTA BANNER (Section 3) */}
        <section className="final-cta-banner" aria-label="Final call to action">
          <div className="final-cta-visual">
            <Image src="/images/commercial-solar.webp" alt="Commercial rooftop solar panels array" fill sizes="100vw" />
            <div className="final-cta-overlay" />
          </div>
          <div className="section-shell final-cta-content">
            <p className="eyebrow light">POWER YOUR FUTURE WITH ELECTROTECH</p>
            <h2>Engineered for Performance & Reliability.</h2>
            <p className="final-cta-copy">Solar and electrical solutions designed for sustainable savings, robust infrastructure, and uninterrupted power.</p>
            <div className="final-cta-actions">
              <a className="button button-primary" href="#contact" onClick={(e) => { e.preventDefault(); scrollToSection("contact"); }}>
                Request a Solar Quote <LinkIcon />
              </a>
              <a className="button button-outline-light" href={siteConfig.whatsappHref} target="_blank" rel="noreferrer">
                <MessageCircle size={16} strokeWidth={1.8} aria-hidden="true" /> WhatsApp Consultation <LinkIcon />
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* MAIN FOOTER (Lumora-inspired) */}
      <footer className="footer">
        <div className="section-shell footer-main">
          <div className="footer-brand-block">
            <a className="footer-brand" href="#home" onClick={(e) => { e.preventDefault(); scrollToSection("home"); }} aria-label="Electro Tech home">
              <Image src="/logos/electrotech-horizontal-dark.png" width={407} height={112} alt="Electro Tech — Electrical & Solar Solutions" />
            </a>
            <p className="footer-descriptor">Electrical & Solar Solutions</p>
            <p className="footer-statement">Solar, electrical and infrastructure solutions engineered for homes, businesses, and institutions.</p>
            <div className="footer-direct-contacts">
              <a href={siteConfig.phoneHref}><Phone size={15} strokeWidth={1.8} aria-hidden="true" /><span>{siteConfig.phoneDisplay}</span></a>
              <a href={siteConfig.whatsappHref} target="_blank" rel="noreferrer"><MessageCircle size={15} strokeWidth={1.8} aria-hidden="true" /><span>WhatsApp</span></a>
              <a href={`mailto:${siteConfig.email}`}><Mail size={15} strokeWidth={1.8} aria-hidden="true" /><span>{siteConfig.email}</span></a>
            </div>
          </div>
          <div className="footer-column">
            <h2>Company</h2>
            {footerCompany.map(([label, href]) => (
              <a key={href} href={href} onClick={(e) => { e.preventDefault(); scrollToSection(href); }}>
                {label}
              </a>
            ))}
          </div>
          <div className="footer-column">
            <h2>Solutions</h2>
            {footerSolutions.map(([label, href]) => (
              <a key={label} href={href} onClick={(e) => { e.preventDefault(); scrollToSection(href); }}>
                {label}
              </a>
            ))}
          </div>
          <div className="footer-column footer-contact-col">
            <h2>Get In Touch</h2>
            <p className="footer-office-hours">
              <span>Office hours:</span>
              <span>Mon–Sat 9:00 AM – 6:00 PM</span>
            </p>
            <a className="footer-cta-link" href="#contact" onClick={(e) => { e.preventDefault(); scrollToSection("contact"); }}>
              Book an on-site solar survey <LinkIcon />
            </a>
          </div>
        </div>
        <div className="section-shell footer-bottom">
          <span className="footer-copyright">© {new Date().getFullYear()} Electro Tech. All rights reserved.</span>
          <span className="footer-credit">
            Designed &amp; Developed by{" "}
            <a
              href="https://rapidosolutions.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-credit-link"
            >
              Rapido Solutions Co.
            </a>
          </span>
          <div className="footer-bottom-spacer" aria-hidden="true" />
        </div>
      </footer>

      <a
        href={`https://wa.me/${siteConfig.whatsappNumber}`}
        target="_blank"
        rel="noopener noreferrer"
        className="floating-whatsapp"
        aria-label="Chat on WhatsApp"
        title="Chat on WhatsApp"
      >
        <WhatsAppIcon className="floating-whatsapp-icon" />
      </a>
    </>
  );
}
