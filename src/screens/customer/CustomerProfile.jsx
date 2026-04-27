import "../../styles/css/customer/customerProfileStyle.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import { apiRequest } from "../../services/api";

function inferBrandFromVehicle(vehicle, brands = []) {
  const vehicleLabel = String(vehicle || "").trim().toLowerCase();
  if (!vehicleLabel) return "";

  return [...brands]
    .sort((left, right) => right.length - left.length)
    .find((brand) => vehicleLabel === brand.toLowerCase() || vehicleLabel.startsWith(`${brand.toLowerCase()} `)) || "";
}

function extractModelFromVehicle(vehicle, brand) {
  const vehicleLabel = String(vehicle || "").trim();
  const brandLabel = String(brand || "").trim();
  if (!vehicleLabel) return "";
  if (!brandLabel) return vehicleLabel;

  const normalizedVehicle = vehicleLabel.toLowerCase();
  const normalizedBrand = brandLabel.toLowerCase();
  if (normalizedVehicle === normalizedBrand) return "";
  if (normalizedVehicle.startsWith(`${normalizedBrand} `)) {
    return vehicleLabel.slice(brandLabel.length).trim();
  }
  return vehicleLabel;
}

function formatVehicleLabel(brand, model) {
  return [String(brand || "").trim(), String(model || "").trim()].filter(Boolean).join(" ").trim();
}

function findMatchingBrand(brand, brands = []) {
  const normalizedValue = String(brand || "").trim().toLowerCase();
  if (!normalizedValue) return "";
  return brands.find((option) => option.toLowerCase() === normalizedValue) || "";
}

function filterSuggestions(options, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return options.slice(0, 12);
  }

  return options
    .filter((option) => option.toLowerCase().includes(normalizedQuery))
    .slice(0, 12);
}

const CAR_SIZE_OPTIONS = [
  "Sedan / Small Car",
  "Midsize / Pickup / MPV",
  "SUV",
  "XL / Van / Semi Truck",
];

function normalizeCars(cars) {
  if (!Array.isArray(cars)) return [];

  const seen = new Set();
  return cars
    .map((car) => ({
      brand: String(car?.brand || car?.make || "").trim(),
      vehicle: String(car?.vehicle || "").trim(),
      size: CAR_SIZE_OPTIONS.includes(String(car?.size || "").trim()) ? String(car?.size || "").trim() : "",
      plate: String(car?.plate || "").trim().toUpperCase(),
    }))
    .filter((car) => car.vehicle && car.plate)
    .filter((car) => {
      const key = `${car.brand.toLowerCase()}::${car.vehicle.toLowerCase()}::${car.plate.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function createEmptyCar() {
  return { brand: "", vehicle: "", size: "", plate: "" };
}

export default function CustomerProfile({ session }) {
  const { currentUser, updateProfile, requestPasswordChangeOtp, verifyPasswordChangeOtp, resetPasswordWithOtp } = useAdminData();
  const initial = useMemo(
    () => ({
      first: currentUser?.first || session?.first || session?.firstName || "",
      last: currentUser?.last || session?.last || session?.lastName || "",
      email: currentUser?.email || session?.email || "",
      phone: currentUser?.phone || session?.phone || "",
      cars: normalizeCars(currentUser?.cars),
    }),
    [currentUser, session]
  );

  const [saved, setSaved] = useState(initial);
  const [modalOpen, setModalOpen] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [form, setForm] = useState(initial);
  const [pwStep, setPwStep] = useState("idle");
  const [verifyEmail, setVerifyEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [otpSession, setOtpSession] = useState({ verificationId: "", destination: "" });
  const [otpError, setOtpError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passError, setPassError] = useState("");
  const [carBrands, setCarBrands] = useState([]);
  const [carModelsByBrand, setCarModelsByBrand] = useState({});
  const [loadingCarBrands, setLoadingCarBrands] = useState(false);
  const [loadingModelBrands, setLoadingModelBrands] = useState({});
  const [carCatalogError, setCarCatalogError] = useState("");
  const [openLookup, setOpenLookup] = useState({ type: "", index: -1 });
  const otpRefs = useRef([]);
  const timerRef = useRef(null);

  const loadModelsForBrand = async (brand) => {
    const normalizedBrand = String(brand || "").trim();
    if (!normalizedBrand) return [];

    const cacheKey = normalizedBrand.toLowerCase();
    if (Array.isArray(carModelsByBrand[cacheKey])) {
      return carModelsByBrand[cacheKey];
    }

    setLoadingModelBrands((prev) => ({ ...prev, [cacheKey]: true }));
    try {
      const payload = await apiRequest(`/api/reference/vehicle-models?brand=${encodeURIComponent(normalizedBrand)}`);
      const models = Array.isArray(payload?.models) ? payload.models : [];
      setCarModelsByBrand((prev) => ({ ...prev, [cacheKey]: models }));
      return models;
    } catch (error) {
      setCarCatalogError(error.message || "Could not load car models.");
      return [];
    } finally {
      setLoadingModelBrands((prev) => ({ ...prev, [cacheKey]: false }));
    }
  };

  useEffect(() => {
    setSaved(initial);
    if (!modalOpen) {
      setForm(initial);
    }
  }, [initial, modalOpen]);

  useEffect(() => {
    let active = true;

    const loadCarBrands = async () => {
      setLoadingCarBrands(true);
      try {
        const payload = await apiRequest("/api/reference/vehicle-brands");
        if (!active) return;
        setCarBrands(Array.isArray(payload?.brands) ? payload.brands : []);
      } catch (error) {
        if (!active) return;
        setCarCatalogError(error.message || "Could not load car brands.");
      } finally {
        if (active) setLoadingCarBrands(false);
      }
    };

    loadCarBrands();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!modalOpen || !carBrands.length) return;

    const brandsToLoad = [...new Set(
      form.cars
        .map((car) => String(car.brand || inferBrandFromVehicle(car.vehicle, carBrands)).trim())
        .filter(Boolean)
    )];

    brandsToLoad.forEach((brand) => {
      const cacheKey = brand.toLowerCase();
      if (!Array.isArray(carModelsByBrand[cacheKey])) {
        loadModelsForBrand(brand);
      }
    });
  }, [modalOpen, form.cars, carBrands, carModelsByBrand]);

  const initialLetter = useMemo(() => {
    const base = String(saved.first || saved.email || "C").trim();
    return base ? base[0].toUpperCase() : "C";
  }, [saved]);

  const startCountdown = () => {
    clearInterval(timerRef.current);
    setCountdown(60);
    timerRef.current = setInterval(() => {
      setCountdown((count) => {
        if (count <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return count - 1;
      });
    }, 1000);
  };

  const openModal = () => {
    setForm(saved);
    setPwStep("idle");
    setVerifyEmail(initial.email);
    setOtpDigits(["", "", "", "", "", ""]);
    setOtpSession({ verificationId: "", destination: "" });
    setOtpError("");
    setCountdown(0);
    setNewPass("");
    setConfirmPass("");
    setPassError("");
    setAnimating(true);
    setModalOpen(true);
  };

  const closeModal = () => {
    clearInterval(timerRef.current);
    setAnimating(false);
    setTimeout(() => setModalOpen(false), 180);
  };

  const handleSendOtp = async () => {
    const normalizedEmail = String(verifyEmail || "").trim().toLowerCase();
    const currentEmail = String(saved.email || initial.email || "").trim().toLowerCase();
    if (!normalizedEmail.includes("@")) {
      setOtpError("Please enter a valid email address.");
      return;
    }
    if (normalizedEmail !== currentEmail) {
      setOtpError("Use your current account email to receive the OTP.");
      return;
    }
    try {
      setOtpError("");
      setOtpDigits(["", "", "", "", "", ""]);
      const payload = await requestPasswordChangeOtp({ email: normalizedEmail, channel: "email" });
      setOtpSession({
        verificationId: payload?.verificationId || "",
        destination: payload?.destination || normalizedEmail,
      });
      startCountdown();
      setPwStep("otp");
    } catch (error) {
      setOtpError(error.message || "Failed to send OTP.");
    }
  };

  const handleOtpChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    setOtpError("");
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, event) => {
    if (event.key === "Backspace") {
      if (otpDigits[index]) {
        const next = [...otpDigits];
        next[index] = "";
        setOtpDigits(next);
      } else if (index > 0) {
        otpRefs.current[index - 1]?.focus();
      }
    }
  };

  const handleVerifyOtp = async () => {
    const code = otpDigits.join("");
    if (code.length < 6) {
      setOtpError("Please enter the 6-digit code.");
      return;
    }
    if (!otpSession.verificationId) {
      setOtpError("Please request a new OTP.");
      return;
    }
    try {
      setOtpError("");
      await verifyPasswordChangeOtp({ verificationId: otpSession.verificationId, otp: code });
      setPwStep("newpass");
    } catch (error) {
      setOtpError(error.message || "Failed to verify OTP.");
    }
  };

  const updateCar = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      cars: prev.cars.map((car, carIndex) =>
        carIndex === index
          ? {
              ...car,
              [key]: key === "plate" ? value.toUpperCase() : value,
            }
          : car
      ),
    }));
  };

  const updateCarBrand = (index, brand) => {
    const rawBrand = String(brand || "");
    const nextBrand = rawBrand.trimStart();
    const matchedBrand = findMatchingBrand(nextBrand, carBrands);
    setForm((prev) => ({
      ...prev,
      cars: prev.cars.map((car, carIndex) =>
        carIndex === index
          ? {
              ...car,
              brand: nextBrand,
              vehicle: matchedBrand && matchedBrand === car.brand ? car.vehicle : "",
            }
          : car
      ),
    }));

    if (matchedBrand) {
      loadModelsForBrand(matchedBrand);
    }
  };

  const handleCarBrandBlur = (index) => {
    setForm((prev) => ({
      ...prev,
      cars: prev.cars.map((car, carIndex) => {
        if (carIndex !== index) return car;
        const matchedBrand = findMatchingBrand(car.brand, carBrands);
        if (!String(car.brand || "").trim()) {
          return { ...car, brand: "", vehicle: "" };
        }
        if (!matchedBrand) {
          return { ...car, brand: "", vehicle: "" };
        }
        if (matchedBrand === car.brand) {
          return car;
        }
        return { ...car, brand: matchedBrand };
      }),
    }));
    setOpenLookup((prev) => (prev.type === "brand" && prev.index === index ? { type: "", index: -1 } : prev));
  };

  const updateCarModel = (index, model) => {
    const nextModel = String(model || "").trim();
    setForm((prev) => ({
      ...prev,
      cars: prev.cars.map((car, carIndex) => {
        if (carIndex !== index) return car;
        const activeBrand = findMatchingBrand(car.brand, carBrands) || String(car.brand || inferBrandFromVehicle(car.vehicle, carBrands)).trim();
        return {
          ...car,
          brand: activeBrand,
          vehicle: formatVehicleLabel(activeBrand, nextModel),
        };
      }),
    }));
  };

  const handleCarModelBlur = (index) => {
    setForm((prev) => ({
      ...prev,
      cars: prev.cars.map((car, carIndex) => {
        if (carIndex !== index) return car;
        const activeBrand = findMatchingBrand(car.brand || inferBrandFromVehicle(car.vehicle, carBrands), carBrands);
        const typedModel = extractModelFromVehicle(car.vehicle, activeBrand);
        if (!typedModel) {
          return { ...car, vehicle: activeBrand || "" };
        }

        const validModels = carModelsByBrand[String(activeBrand || "").trim().toLowerCase()] || [];
        const matchedModel = validModels.find((option) => option.toLowerCase() === typedModel.toLowerCase());
        return {
          ...car,
          brand: activeBrand,
          vehicle: formatVehicleLabel(activeBrand, matchedModel || typedModel),
        };
      }),
    }));
    setOpenLookup((prev) => (prev.type === "model" && prev.index === index ? { type: "", index: -1 } : prev));
  };

  const addCar = () => {
    setForm((prev) => ({ ...prev, cars: [...prev.cars, createEmptyCar()] }));
  };

  const removeCar = (index) => {
    setForm((prev) => ({ ...prev, cars: prev.cars.filter((_, carIndex) => carIndex !== index) }));
  };

  const handleSaveAll = async () => {
    const payload = {
      first: form.first.trim(),
      last: form.last.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      cars: normalizeCars(form.cars),
    };

    if (!payload.first || !payload.last) {
      window.alert("Please enter your first and last name.");
      return;
    }
    if (!payload.email.includes("@")) {
      window.alert("Please enter a valid email address.");
      return;
    }
    const hasIncompleteCar = form.cars.some((car) => {
      const values = [car.brand, car.vehicle, car.size, car.plate].map((value) => String(value || "").trim());
      const hasAnyValue = values.some(Boolean);
      if (!hasAnyValue) return false;
      return values.some((value) => !value);
    });
    if (hasIncompleteCar) {
      window.alert("Please complete Car Brand, Car Model, Car Size, and Plate Number for each saved car.");
      return;
    }
    const hasInvalidBrand = form.cars.some((car) => {
      const brand = String(car.brand || "").trim();
      return brand && !findMatchingBrand(brand, carBrands);
    });
    if (hasInvalidBrand) {
      window.alert("Please choose a car brand from the dropdown suggestions.");
      return;
    }
    if (pwStep === "newpass") {
      if (!newPass) {
        setPassError("Please enter a new password.");
        return;
      }
      if (newPass.length < 8) {
        setPassError("Password must be at least 8 characters.");
        return;
      }
      if (newPass !== confirmPass) {
        setPassError("Passwords do not match.");
        return;
      }
      if (!otpSession.verificationId) {
        setPassError("Please verify the OTP again.");
        return;
      }
      await resetPasswordWithOtp({ verificationId: otpSession.verificationId, password: newPass });
    }
    await updateProfile(payload);
    setSaved(payload);
    closeModal();
  };

  const canSave = pwStep === "idle" || pwStep === "newpass";

  return (
    <>
      <div className="clProWrap">
        <div className="clProCard">
          <div className="clProInner">
            <div className="clProLeft">
              <div className="clProAvatar">{initialLetter}</div>
            </div>

            <div className="clProForm">
              <div className="clProGrid2">
                <div className="clProField">
                  <div className="clProLabel">First Name</div>
                  <input className="clProInput" readOnly value={saved.first} placeholder="Enter your first name" />
                </div>
                <div className="clProField">
                  <div className="clProLabel">Last Name</div>
                  <input className="clProInput" readOnly value={saved.last} placeholder="Enter your last name" />
                </div>
              </div>

              <div className="clProField">
                <div className="clProLabel">Email</div>
                <input className="clProInput" readOnly value={saved.email} placeholder="Enter your email" />
              </div>

              <div className="clProField">
                <div className="clProLabel">Phone</div>
                <input className="clProInput" readOnly value={saved.phone} placeholder="09xx xxx xxxx" />
              </div>

              <div className="clProField">
                <div className="clProLabel">Password</div>
                <input className="clProInput" readOnly type="password" value="placeholder" />
              </div>

              <div className="clCarSection">
                <div className="clCarSectionHead">
                  <div>
                    <div className="clCarTitle">Saved Cars</div>
                    <div className="clCarSub">These will be available in booking forms for autofill.</div>
                  </div>
                </div>
                {saved.cars.length ? (
                  <div className="clCarList">
                    {saved.cars.map((car) => (
                      <div key={`${car.vehicle}-${car.plate}`} className="clCarItem">
                        <div className="clCarVehicle">{car.vehicle}</div>
                        <div className="clCarSize">{car.size}</div>
                        <div className="clCarPlate">{car.plate}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="clCarEmpty">No car details saved yet.</div>
                )}
              </div>

              <div className="clProActions">
                <button type="button" className="clProSaveBtn" onClick={openModal}>Edit Account</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className={`clM-overlay${animating ? " open" : ""}`} onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="clM-box clM-boxWide">
            <div className="clM-head">
              <div>
                <p className="clM-title">Edit Account</p>
                <p className="clM-sub">Update your personal information and saved car details</p>
              </div>
              <button className="clM-x" type="button" onClick={closeModal}>✕</button>
            </div>

            <div className="clM-body">
              <div className="clProGrid2">
                <div className="clM-field">
                  <div className="clM-label">First Name</div>
                  <input className="clM-input" value={form.first} onChange={(e) => setForm((prev) => ({ ...prev, first: e.target.value }))} placeholder="First name" />
                </div>
                <div className="clM-field">
                  <div className="clM-label">Last Name</div>
                  <input className="clM-input" value={form.last} onChange={(e) => setForm((prev) => ({ ...prev, last: e.target.value }))} placeholder="Last name" />
                </div>
              </div>

              <div className="clM-field">
                <div className="clM-label">Email</div>
                <input className="clM-input" type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="Enter your email" />
              </div>

              <div className="clM-field">
                <div className="clM-label">Phone</div>
                <input className="clM-input" type="tel" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value.replace(/\D/g, "").slice(0, 11) }))} placeholder="09xx xxx xxxx" />
              </div>

              <div className="clM-divider"><span>Car Details</span></div>
              <div className="clCarEditor">
                {carCatalogError && <div className="clCarCatalogError">{carCatalogError}</div>}
                {form.cars.map((car, index) => (
                  <div key={`car-${index}`} className="clCarEditorRow clCarEditorRowWide">
                    <div className="clCarField">
                      <div className="clM-label">Car Brand</div>
                      <div className="clCarLookup">
                        <input
                          className="clM-input"
                          value={car.brand || inferBrandFromVehicle(car.vehicle, carBrands)}
                          onChange={(e) => updateCarBrand(index, e.target.value)}
                          onFocus={() => setOpenLookup({ type: "brand", index })}
                          onBlur={() => setTimeout(() => handleCarBrandBlur(index), 120)}
                          placeholder={loadingCarBrands ? "Loading car brands..." : "Search car brand"}
                        />
                        {openLookup.type === "brand" && openLookup.index === index && filterSuggestions(carBrands, car.brand || inferBrandFromVehicle(car.vehicle, carBrands)).length > 0 && (
                          <div className="clCarLookupMenu">
                            {filterSuggestions(carBrands, car.brand || inferBrandFromVehicle(car.vehicle, carBrands)).map((brand) => (
                              <button
                                key={brand}
                                type="button"
                                className="clCarLookupItem"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                  updateCarBrand(index, brand);
                                  setForm((prev) => ({
                                    ...prev,
                                    cars: prev.cars.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, brand, vehicle: "" } : entry
                                    ),
                                  }));
                                  loadModelsForBrand(brand);
                                  setOpenLookup({ type: "model", index });
                                }}
                              >
                                {brand}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="clCarField">
                      <div className="clM-label">Car Model</div>
                      <div className="clCarLookup">
                        <input
                          className="clM-input"
                          value={extractModelFromVehicle(car.vehicle, findMatchingBrand(car.brand, carBrands) || car.brand || inferBrandFromVehicle(car.vehicle, carBrands))}
                          onChange={(e) => updateCarModel(index, e.target.value)}
                          onFocus={() => {
                            const activeBrand = findMatchingBrand(car.brand || inferBrandFromVehicle(car.vehicle, carBrands), carBrands);
                            if (activeBrand) {
                              loadModelsForBrand(activeBrand);
                              setOpenLookup({ type: "model", index });
                            }
                          }}
                          onBlur={() => setTimeout(() => handleCarModelBlur(index), 120)}
                          disabled={!findMatchingBrand(car.brand || inferBrandFromVehicle(car.vehicle, carBrands), carBrands)}
                          placeholder={
                            !findMatchingBrand(car.brand || inferBrandFromVehicle(car.vehicle, carBrands), carBrands)
                              ? "Choose car brand first"
                              : loadingModelBrands[String(findMatchingBrand(car.brand || inferBrandFromVehicle(car.vehicle, carBrands), carBrands)).trim().toLowerCase()]
                                ? "Loading car models..."
                                : "Search car model"
                          }
                        />
                        {openLookup.type === "model" && openLookup.index === index && (() => {
                          const activeBrand = findMatchingBrand(car.brand || inferBrandFromVehicle(car.vehicle, carBrands), carBrands);
                          const modelOptions = carModelsByBrand[String(activeBrand || "").trim().toLowerCase()] || [];
                          const filteredModels = filterSuggestions(
                            modelOptions,
                            extractModelFromVehicle(car.vehicle, activeBrand)
                          );
                          if (!filteredModels.length) return null;
                          return (
                            <div className="clCarLookupMenu">
                              {filteredModels.map((model) => (
                                <button
                                  key={model}
                                  type="button"
                                  className="clCarLookupItem"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    updateCarModel(index, model);
                                    setOpenLookup({ type: "", index: -1 });
                                  }}
                                >
                                  {model}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="clCarField">
                      <div className="clM-label">Car Size</div>
                      <select
                        className="clM-input clCarSizeSelect"
                        value={car.size}
                        onChange={(e) => updateCar(index, "size", e.target.value)}
                      >
                        <option value="">Select car size</option>
                        {CAR_SIZE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="clCarField">
                      <div className="clM-label">Plate Number</div>
                      <input className="clM-input" value={car.plate} onChange={(e) => updateCar(index, "plate", e.target.value)} placeholder="Plate number" />
                    </div>
                    <button className="clCarRemoveBtn" type="button" onClick={() => removeCar(index)}>Remove</button>
                  </div>
                ))}
                <button className="clCarAddBtn" type="button" onClick={addCar}>Add Car</button>
              </div>

              <div className="clM-divider"><span>Password</span></div>

              <div className="clPw-box">
                {pwStep === "idle" && (
                  <>
                    <div>
                      <p className="clPw-title">Change Password</p>
                      <p className="clPw-sub">Verify your identity with a one-time code first.</p>
                    </div>
                    <button className="clPw-trigger" type="button" onClick={() => { setVerifyEmail(saved.email || initial.email || ""); setPwStep("email"); }}>Change Password →</button>
                  </>
                )}

                {pwStep === "email" && (
                  <>
                    <button className="clBack-btn" type="button" onClick={() => { setPwStep("idle"); setOtpError(""); }}>← Back</button>
                    <div className="clM-field">
                      <div className="clM-label">Enter your email to receive OTP</div>
                      <input className={`clM-input${otpError ? " eb" : ""}`} type="email" value={verifyEmail} onChange={(e) => { setVerifyEmail(e.target.value); setOtpError(""); }} placeholder="your@email.com" onKeyDown={(e) => e.key === "Enter" && handleSendOtp()} autoFocus />
                      {otpError && <div className="clErr-msg">{otpError}</div>}
                    </div>
                    <button className="clFull-btn" type="button" onClick={handleSendOtp}>Send OTP</button>
                  </>
                )}

                {pwStep === "otp" && (
                  <>
                    <button className="clBack-btn" type="button" onClick={() => { setPwStep("email"); setOtpDigits(["", "", "", "", "", ""]); setOtpError(""); }}>← Back</button>
                    <p className="clOtp-hint">Enter the 6-digit code sent to <strong>{otpSession.destination || verifyEmail}</strong>.</p>
                    <div className="clOtp-boxes">
                      {otpDigits.map((digit, index) => (
                        <input key={index} ref={(el) => { otpRefs.current[index] = el; }} className={`clOtp-box${digit ? " ok" : ""}${otpError ? " bad" : ""}`} type="text" inputMode="numeric" maxLength={1} value={digit} onChange={(e) => handleOtpChange(index, e.target.value)} onKeyDown={(e) => handleOtpKeyDown(index, e)} onFocus={(e) => e.target.select()} autoFocus={index === 0} />
                      ))}
                    </div>
                    {otpError && <div className="clErr-msg">{otpError}</div>}
                    <div className="clResend-row">
                      {countdown > 0 ? `Resend in ${countdown}s` : <><span>Didn't get it? </span><button type="button" onClick={handleSendOtp}>Resend OTP</button></>}
                    </div>
                    <button className="clFull-btn" type="button" onClick={handleVerifyOtp}>Verify OTP</button>
                  </>
                )}

                {pwStep === "newpass" && (
                  <>
                    <div className="clVerified-badge">✓ Identity verified - set your new password</div>
                    <div className="clM-field">
                      <div className="clM-label">New Password</div>
                      <div className="clPw-input-row">
                        <input className={`clM-input${passError ? " eb" : ""}`} type="password" value={newPass} onChange={(e) => { setNewPass(e.target.value); setPassError(""); }} placeholder="Min. 8 characters" autoFocus />
                      </div>
                    </div>
                    <div className="clM-field">
                      <div className="clM-label">Confirm Password</div>
                      <div className="clPw-input-row">
                        <input className={`clM-input${passError ? " eb" : ""}`} type="password" value={confirmPass} onChange={(e) => { setConfirmPass(e.target.value); setPassError(""); }} placeholder="Re-enter new password" />
                      </div>
                    </div>
                    {passError && <div className="clErr-msg">{passError}</div>}
                  </>
                )}
              </div>
            </div>

            <div className="clM-foot">
              <button className="clM-cancel" type="button" onClick={closeModal}>Cancel</button>
              <button className="clM-save" type="button" disabled={!canSave} onClick={handleSaveAll}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
