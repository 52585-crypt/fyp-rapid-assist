const MECHANIC_BASE_FEE = 300;
const MECHANIC_DISTANCE_FEE_PER_KM = 30;

const PETROL_PRICE_PER_LITER = 280;
const DIESEL_PRICE_PER_LITER = 285;
const FUEL_DELIVERY_FEE = 150;

const TOWING_MINIMUM_FEE = 1200;
const TOWING_PER_KM_RATE = 80;

function hasDropoffLocation(dropoffLocation) {
  if (!dropoffLocation || typeof dropoffLocation !== "object") {
    return false;
  }

  const addr =
    typeof dropoffLocation.address === "string" &&
    dropoffLocation.address.trim().length > 0;

  const lat = dropoffLocation.lat;
  const lng = dropoffLocation.lng;
  const coords =
    lat != null &&
    lng != null &&
    !Number.isNaN(Number(lat)) &&
    !Number.isNaN(Number(lng));

  return Boolean(addr || coords);
}

function calculateMechanicPricing(distanceKm) {
  const km = Number(distanceKm);
  if (Number.isNaN(km) || km < 0) {
    throw new Error("distanceKm must be a non-negative number.");
  }

  const mechanicDistanceFee = km * MECHANIC_DISTANCE_FEE_PER_KM;
  const extraWorkTotal = 0;
  const totalAmount = MECHANIC_BASE_FEE + mechanicDistanceFee + extraWorkTotal;

  return {
    mechanicBaseFee: MECHANIC_BASE_FEE,
    mechanicDistanceFeePerKm: MECHANIC_DISTANCE_FEE_PER_KM,
    mechanicDistanceFee,
    extraWorkTotal,
    totalAmount,
    distanceKm: km,
  };
}

function pricePerLiterForFuel(fuelType) {
  if (fuelType === "petrol") return PETROL_PRICE_PER_LITER;
  if (fuelType === "diesel") return DIESEL_PRICE_PER_LITER;
  throw new Error("fuelDetails.fuelType must be petrol or diesel.");
}

function calculateFuelPricing(fuelType, quantityLiters) {
  const qty = Number(quantityLiters);
  if (Number.isNaN(qty) || qty <= 0) {
    throw new Error("quantityLiters must be a positive number.");
  }

  const pricePerLiter = pricePerLiterForFuel(fuelType);
  const fuelAmount = qty * pricePerLiter;
  const totalAmount = fuelAmount + FUEL_DELIVERY_FEE;

  return {
    fuelDetails: {
      fuelType,
      quantityLiters: qty,
      pricePerLiter,
    },
    fuelAmount,
    fuelDeliveryFee: FUEL_DELIVERY_FEE,
    totalAmount,
  };
}

function calculateTowingPricing(dropoffLocation, towingDistanceKm) {
  const hasDropoff = hasDropoffLocation(dropoffLocation);

  let km = 0;
  if (hasDropoff) {
    km = Number(towingDistanceKm);
    if (Number.isNaN(km) || km < 0) {
      throw new Error(
        "towingDistanceKm must be a non-negative number when dropoff location is provided."
      );
    }
  }

  const towingDistanceFee = km * TOWING_PER_KM_RATE;
  const totalAmount = TOWING_MINIMUM_FEE + towingDistanceFee;

  return {
    towingMinimumFee: TOWING_MINIMUM_FEE,
    towingPerKmRate: TOWING_PER_KM_RATE,
    towingDistanceKm: km,
    towingDistanceFee,
    totalAmount,
  };
}

module.exports = {
  MECHANIC_BASE_FEE,
  MECHANIC_DISTANCE_FEE_PER_KM,
  PETROL_PRICE_PER_LITER,
  DIESEL_PRICE_PER_LITER,
  FUEL_DELIVERY_FEE,
  TOWING_MINIMUM_FEE,
  TOWING_PER_KM_RATE,
  hasDropoffLocation,
  calculateMechanicPricing,
  calculateFuelPricing,
  calculateTowingPricing,
  pricePerLiterForFuel,
};
