import { useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Container from "../components/Container";
import "../styles/css/home.css";
import { apiRequest } from "../services/api";
import { CAR_SIZE_OPTIONS, formatPriceRangeLabel, getPriceForCarSize } from "../utils/servicePricing";

import iconPremium from "../styles/icons/services.png";
import iconCoating from "../styles/icons/stockMonitoring.png";
import iconTint from "../styles/icons/tracking.png";
import iconPpf from "../styles/icons/payments.png";

import work1 from "../assets/IMAGE/IMG_9802.jpg";
import work2 from "../assets/IMAGE/IMG_9803.jpg";
import work3 from "../assets/IMAGE/IMG_9809.jpg";
import heroBackground from "../assets/IMAGE/IMG_9815.jpg";
import aboutBackground from "../assets/IMAGE/IMG_9811.jpg";
import servicesBackground from "../assets/IMAGE/IMG_9818.jpg";
import work4 from "../assets/IMAGE/IMG_9816.jpg";
import work5 from "../assets/IMAGE/IMG_9817.jpg";

import aptlogo from "../styles/images/aptlogo.png";

const SERVICES = [
  {
    id: "wash",
    title: "Premium Car Wash",
    desc: "Durable high-gloss layer that enhances shine and helps protect against scratches, UV, and contaminants.",
    icon: iconPremium,
  },
  {
    id: "motor",
    title: "Motor Coating",
    desc: "Advanced protection with strong hydrophobic properties, anti-static benefits, and long-lasting durability.",
    icon: iconCoating,
  },
  {
    id: "ceramic",
    title: "Ceramic Coating",
    desc: "Durable high-gloss layer that enhances shine and helps protect against scratches, UV, and contaminants.",
    icon: iconCoating,
  },
  {
    id: "graphene",
    title: "Graphene Coating",
    desc: "Advanced protection with strong hydrophobic properties, anti-static benefits, and long-lasting durability.",
    icon: iconCoating,
  },
  {
    id: "tint",
    title: "Nano Ceramic Tint",
    desc: "Exceptional heat rejection and UV protection with privacy, plus a clean and sleek finish for your windows.",
    icon: iconTint,
  },
  {
    id: "ppf",
    title: "PPF (Paint Protection Film)",
    desc: "Virtually invisible shield to defend paint from chips, scratches, and road debris, keeping it looking new longer.",
    icon: iconPpf,
  },
];

const WORKS = [work1, work2, work3, work4, work5, work1];

const INITIAL_QUOTE_FORM = {
  fullName: "",
  phone: "",
  vehicleType: "",
  carSize: "",
  service: "",
  message: "",
};

export default function Home() {
  const [serviceCatalog, setServiceCatalog] = useState([]);
  const [quoteForm, setQuoteForm] = useState(INITIAL_QUOTE_FORM);
  const [quoteStatus, setQuoteStatus] = useState("");
  const [quoteError, setQuoteError] = useState("");
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);

  const scrollTo = (id) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const handleQuoteClick = (serviceTitle = "") => {
    setQuoteForm((prev) => ({ ...prev, service: serviceTitle }));
    setQuoteStatus("");
    setQuoteError("");
    scrollTo("contact");
  };

  useEffect(() => {
    let active = true;

    const loadServices = async () => {
      try {
        const payload = await apiRequest("/api/admin/bootstrap");
        if (!active) return;
        setServiceCatalog(Array.isArray(payload?.services) ? payload.services.filter((service) => service?.enabled !== false) : []);
      } catch (_error) {
        if (!active) return;
        setServiceCatalog([]);
      }
    };

    loadServices();
    return () => {
      active = false;
    };
  }, []);

  const quoteServices = useMemo(() => {
    if (serviceCatalog.length) {
      return serviceCatalog.map((service) => ({
        id: service.id || service.name,
        title: service.name,
        desc: service.desc || "",
        liveService: service,
      }));
    }

    return SERVICES.map((service) => ({
      ...service,
      liveService: null,
    }));
  }, [serviceCatalog]);

  const matchedQuoteService = useMemo(
    () =>
      quoteServices.find(
        (service) => String(service.title || "").trim().toLowerCase() === String(quoteForm.service || "").trim().toLowerCase()
      ) || null,
    [quoteServices, quoteForm.service]
  );

  const quoteEstimate = useMemo(() => {
    const service = matchedQuoteService?.liveService;
    if (!service) {
      return {
        label: quoteForm.service ? "Custom quote available upon review" : "Select a service to estimate",
        helper: "Choose a service and car size to see an estimated range.",
        exact: false,
      };
    }

    if (quoteForm.carSize) {
      const amount = getPriceForCarSize(service, quoteForm.carSize);
      return {
        label: amount > 0 ? `Estimated Price: P ${amount.toLocaleString()}` : "Custom quote available upon review",
        helper: quoteForm.carSize ? `${quoteForm.carSize} pricing based on your current service catalog.` : "",
        exact: amount > 0,
      };
    }

    return {
      label: `Estimated Range: ${formatPriceRangeLabel(service)}`,
      helper: "Pick a car size for a more exact estimate.",
      exact: false,
    };
  }, [matchedQuoteService, quoteForm.carSize, quoteForm.service]);

  const updateQuoteField = (key, value) => {
    setQuoteForm((prev) => ({ ...prev, [key]: value }));
    setQuoteStatus("");
    setQuoteError("");
  };

  const handleQuoteSubmit = async (event) => {
    event.preventDefault();
    setIsSubmittingQuote(true);
    setQuoteStatus("");
    setQuoteError("");
    try {
      const payload = await apiRequest("/api/public/quotes", {
        method: "POST",
        body: JSON.stringify({
          ...quoteForm,
          estimatedAmount: matchedQuoteService?.liveService ? getPriceForCarSize(matchedQuoteService.liveService, quoteForm.carSize) : 0,
          estimateLabel: quoteEstimate.label,
        }),
      });

      setQuoteStatus(payload?.message || "Quote request saved successfully.");
      setQuoteForm((prev) => ({
        ...INITIAL_QUOTE_FORM,
        service: prev.service,
      }));
    } catch (error) {
      setQuoteError(error.message || "Could not save your quote request.");
    } finally {
      setIsSubmittingQuote(false);
    }
  };

  return (
    <div className="page">
      <Navbar />

      <main>
        <section
          className="heroBackdrop"
          style={{ "--hero-photo": `url(${heroBackground})` }}
        >
          <Container>
            <section className="hero">
            <div className="heroShell">
            <div className="heroGrid">
              <div className="heroLeft heroContentPanel">
                <div className="heroTag">
                  <span className="pillDot" />
                  Quality is our Top Priority • Customer Satisfaction is our end goal.
                </div>

                <h1 className="heroTitle">
                  Premium protection &amp; advanced car care for{" "}
                  <span className="accent">Allpro-tec.</span>
                </h1>

                <p className="heroSub">
                  Founded in 2024. Allpro-tec may be new in name, but our team is backed by
                  9+ years of auto care experience, focused on quality, protection, and customer satisfaction.
                </p>

                <div className="heroBtns">
                  <button
                    className="btn btn-solid"
                    onClick={() => handleQuoteClick()}
                  >
                    Book / Get Quote
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={() => scrollTo("services")}
                  >
                    Explore Services
                  </button>
                </div>

                <div className="heroStats">
                  <div className="stat">
                    <div className="statVal">2024</div>
                    <div className="statLab">Founded</div>
                  </div>
                  <div className="stat">
                    <div className="statVal">9+</div>
                    <div className="statLab">Years experience</div>
                  </div>
                  <div className="stat">
                    <div className="statVal">Bacoor</div>
                    <div className="statLab">Cavite operations</div>
                  </div>
                </div>
              </div>

              <div className="heroRight">
                <div className="heroImageCard">
                  <div className="heroBrandPanel">
                    <div className="heroBrandLogoWrap">
                      <img className="heroBrandLogo" src={aptlogo} alt="All Pro-Tec logo" />
                    </div>
                    <div className="floatingBadge floatingBadgeTopRight">
                      <span className="badgeIcon">PM</span> Premium Materials
                    </div>
                    <div className="floatingBadge floatingBadgeBottomLeft">
                      <span className="badgeIcon">AT</span> Advanced Technology
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pillRow heroPillRow">
              <div className="pill"><span className="pillDot" />Premium materials</div>
              <div className="pill"><span className="pillDot" />Advanced technology</div>
              <div className="pill"><span className="pillDot" />Expert workmanship</div>
              <div className="pill"><span className="pillDot" />Long-lasting protection</div>
            </div>
            </div>
            </section>
          </Container>
        </section>

        <Container>

          <section
            id="about"
            className="section aboutSection"
            style={{ "--about-photo": `url(${aboutBackground})` }}
          >
            <div className="sectionLabel">About Us</div>
            <h2 className="sectionTitle">All Pro-Tec: Premium Care Built on Real Experience</h2>
            <p className="sectionSub">
              Meticulous detailing and premium protection, anchored on the same passion for
              quality, protection, and customer satisfaction.
            </p>

            <div className="aboutBody">
              <div className="aboutColumn">
                <div className="aboutHeading">History of Building the Business</div>
                <p className="p">
                  Founded in 2024, Allpro-tec may be new in name, but the expertise behind it
                  is built on years of experience in the auto care industry.
                </p>
                <p className="p">
                  This rebranding reflects our commitment to providing even better, more advanced
                  services, focused on the same passion for quality, protection, and customer satisfaction.
                </p>
                <p className="p">
                  Our seasoned detailers bring only top skills and craftsmanship, ensuring every vehicle gets
                  premium care and attention to detail.
                </p>
              </div>

              <div className="aboutColumn">
                <div className="aboutHeading">Area of Operation</div>
                <p className="p">
                  Block 56 Lot 26 Madrid corner Faura Street Town and Country West Subdivision, Bacoor, Philippines
                </p>

                <div className="quoteBox">
                  <div className="quoteText">
                    "Quality is our Top Priority and Customer Satisfaction is our end goal. We are truly excited
                    to become your partner in giving the best Car Care Services to your well invested cars."
                  </div>
                  <div className="quoteSig">- All Pro-tec</div>
                </div>
              </div>
            </div>
          </section>

        </Container>

        <section
          className="servicesBackdrop"
          style={{ "--services-photo": `url(${servicesBackground})` }}
        >
          <Container>
            <section
              id="services"
              className="section servicesSection"
            >
              <div className="sectionLabel">What We Offer</div>
              <h2 className="sectionTitle">Our Services</h2>
              <p className="sectionSub">
                Advanced protection and clean finishing for your well-invested car.
              </p>

              <div className="servicesGrid">
                {SERVICES.map((s) => (
                  <div key={s.id} className="serviceCard">
                    <div className="serviceTop">
                      <div className="serviceIconWrap">
                        <img className="serviceIcon" src={s.icon} alt={s.title} />
                      </div>
                    </div>
                    <div className="serviceName">{s.title}</div>
                    <div className="serviceDesc">{s.desc}</div>
                    <button
                      className="serviceLink"
                      type="button"
                      onClick={() => handleQuoteClick(s.title)}
                    >
                      Get a quote <span className="arrow">-&gt;</span>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </Container>
        </section>

        <Container>

          <section id="work" className="section works">
            <div className="sectionLabel">Portfolio</div>
            <h2 className="sectionTitle">Our Works</h2>
            <p className="sectionSub">A clean finish you can see.</p>

            <div className="worksGrid">
              {WORKS.map((img, i) => (
                <div key={i} className="workTile">
                  <img className="workImg" src={img} alt={`Work ${i + 1}`} />
                </div>
              ))}
            </div>

            <div className="worksActions">
              <button
                className="btn btn-outline"
                onClick={() => handleQuoteClick()}
              >
                Get a Quote
              </button>
              <button className="btn btn-solid">
                View more work
              </button>
            </div>
          </section>

          <section id="why" className="section">
            <div className="sectionLabel">Our Edge</div>
            <h2 className="sectionTitle">Why Choose All Pro-Tec?</h2>
            <p className="sectionSub">
              We protect what you invested in with quality, detail, and advanced care.
            </p>

            <div className="whyGrid">
              <div className="whyCard">
                <div className="whyTitle">Customer Satisfaction</div>
                <div className="whyDesc">Committed to customer satisfaction in every service.</div>
              </div>
              <div className="whyCard">
                <div className="whyTitle">Premium + Advanced</div>
                <div className="whyDesc">We use premium materials and advanced technology.</div>
              </div>
              <div className="whyCard">
                <div className="whyTitle">Expert Workmanship</div>
                <div className="whyDesc">Meticulous detailing and skilled craftsmanship.</div>
              </div>
              <div className="whyCard">
                <div className="whyTitle">Long-lasting Value</div>
                <div className="whyDesc">Protection designed to last and keep your car looking its best.</div>
              </div>
            </div>
          </section>

          <section id="contact" className="section">
            <div className="sectionLabel">Get In Touch</div>
            <h2 className="sectionTitle">Book or Request a Quote</h2>
            <p className="sectionSub">Send your details and we'll reply with available slots.</p>

            <div className="quoteGrid">
              <div className="quoteFormCard">
                <form
                  className="quoteForm"
                  onSubmit={handleQuoteSubmit}
                >
                  <div className="formRow">
                    <div className="field">
                      <label className="label">Full Name*</label>
                      <input className="input" name="fullName" placeholder="Your Name" value={quoteForm.fullName} onChange={(e) => updateQuoteField("fullName", e.target.value)} required />
                    </div>
                    <div className="field">
                      <label className="label">Phone*</label>
                      <input className="input" name="phone" placeholder="09xx xxx xxxx" value={quoteForm.phone} onChange={(e) => updateQuoteField("phone", e.target.value.replace(/\D/g, "").slice(0, 11))} required />
                    </div>
                  </div>

                  <div className="formRow">
                    <div className="field">
                      <label className="label">Vehicle Type*</label>
                      <input
                        className="input"
                        name="vehicleType"
                        placeholder="e.g., Montero Sport / Honda Civic"
                        value={quoteForm.vehicleType}
                        onChange={(e) => updateQuoteField("vehicleType", e.target.value)}
                        required
                      />
                    </div>
                    <div className="field">
                      <label className="label">Service Needed*</label>
                      <select
                        className="input"
                        name="service"
                        value={quoteForm.service}
                        onChange={(e) => updateQuoteField("service", e.target.value)}
                        required
                      >
                        <option value="">Select a Service</option>
                        {quoteServices.map((s) => (
                          <option key={s.id} value={s.title}>{s.title}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="formRow">
                    <div className="field">
                      <label className="label">Car Size*</label>
                      <select className="input" name="carSize" value={quoteForm.carSize} onChange={(e) => updateQuoteField("carSize", e.target.value)} required>
                        <option value="">Select car size</option>
                        {CAR_SIZE_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">Estimated Quote</label>
                      <div className={`quoteEstimateChip ${quoteEstimate.exact ? "exact" : ""}`}>{quoteEstimate.label}</div>
                    </div>
                  </div>

                  <div className="field">
                    <label className="label">Message (optional)</label>
                    <textarea
                      className="input textarea"
                      name="message"
                      placeholder="Preferred date/time, notes, etc."
                      value={quoteForm.message}
                      onChange={(e) => updateQuoteField("message", e.target.value)}
                    />
                  </div>

                  <div className="quoteEstimatePanel">
                    <div className="quoteEstimateLabel">Quote Summary</div>
                    <div className="quoteEstimateValue">{quoteEstimate.label}</div>
                    <div className="quoteEstimateHint">{quoteEstimate.helper}</div>
                    {matchedQuoteService?.desc ? <div className="quoteEstimateMeta">{matchedQuoteService.desc}</div> : null}
                  </div>

                  {quoteStatus ? <div className="quoteStatus">{quoteStatus}</div> : null}
                  {quoteError ? <div className="quoteStatus quoteStatusError">{quoteError}</div> : null}

                  <div className="formActions">
                    <button className="btn btn-solid" type="submit" disabled={isSubmittingQuote}>
                      {isSubmittingQuote ? "Saving Quote..." : "Prepare Quote"}
                    </button>
                  </div>
                </form>
              </div>

              <div className="quoteInfoCard">
                <div className="infoTitle">Contact &amp; Location</div>

                <div className="infoBlock">
                  <span className="infoDot" />
                  <div className="infoText">
                    Block 56 Lot 26 Madrid corner Faura Street Town and Country West Subdivision, Bacoor, Philippines
                  </div>
                </div>

                <div className="infoBlock">
                  <span className="infoDot infoDotGray" />
                  <div className="infoText">Open daily 8:00 am - 5:00 pm</div>
                </div>

                <div className="miniStack">
                  <div className="miniCard">
                    <div className="miniTitle">Fast reply</div>
                    <div className="miniDesc">Within business hours</div>
                  </div>
                  <div className="miniCard">
                    <div className="miniTitle">Premium care</div>
                    <div className="miniDesc">Quality-first service</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </Container>
      </main>

      <Footer />
    </div>
  );
}
