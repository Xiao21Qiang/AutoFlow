import Button from "./Buttons";
import logo from "../styles/images/aptlogo.png";
import { Link, useNavigate, useLocation } from "react-router-dom";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isHome = location.pathname === "/";

  // If already on home, just scroll. If on another page, navigate home then scroll.
  const handleNavClick = (e, sectionId) => {
    e.preventDefault();
    if (isHome) {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate("/");
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 120);
    }
  };

  return (
    <header className="navWrap">
      <div className="nav">

        {/* Brand — always goes home */}
        <Link to="/" className="brand" style={{ textDecoration: "none" }}>
          <img className="brandLogo" src={logo} alt="All Pro-Tec" />
          <div className="brandText">
            <div className="brandName">ALL PRO-TEC</div>
            <div className="brandSub">Car Care Services</div>
          </div>
        </Link>

        {/* Nav links */}
        <nav className="navLinks">
          <a className="navLink" href="#about"   onClick={(e) => handleNavClick(e, "about")}>About Us</a>
          <a className="navLink" href="#services" onClick={(e) => handleNavClick(e, "services")}>What We Offer</a>
          <a className="navLink" href="#work"     onClick={(e) => handleNavClick(e, "work")}>Portfolio</a>
          <a className="navLink" href="#why"      onClick={(e) => handleNavClick(e, "why")}>Our Edge</a>
          <a className="navLink" href="#contact"  onClick={(e) => handleNavClick(e, "contact")}>Contact Us</a>
        </nav>

        {/* Actions */}
        <div className="navActions">
          <a
            href="#contact"
            style={{ textDecoration: "none" }}
            onClick={(e) => handleNavClick(e, "contact")}
          >
            <Button variant="outline">Get Quote</Button>
          </a>

          <Link to="/login" className="linkReset">
            <Button variant="solid">Log In / Register</Button>
          </Link>
        </div>

      </div>
    </header>
  );
}
