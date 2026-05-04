const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const ServiceRequest = require("../models/ServiceRequest");
const {
  MECHANIC_BASE_FEE,
  MECHANIC_DISTANCE_FEE_PER_KM,
  PETROL_PRICE_PER_LITER,
  DIESEL_PRICE_PER_LITER,
  FUEL_DELIVERY_FEE,
  TOWING_MINIMUM_FEE,
  TOWING_PER_KM_RATE,
} = require("../utils/calculateRequestPricing");

const ONLINE_GATEWAYS = ["card", "easypaisa", "jazzcash", "wallet", "mock"];

function isValidObjectId(id) {
  return Boolean(id && mongoose.Types.ObjectId.isValid(String(id)));
}

function getNumber(...values) {
  for (const v of values) {
    if (v === undefined || v === null) continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function calculateApprovedExtraWorkTotal(extraWork) {
  if (!Array.isArray(extraWork)) {
    return 0;
  }
  return extraWork.reduce((sum, item) => {
    if (!item || item.status !== "approved") {
      return sum;
    }
    const amt = Number(item.amount);
    return sum + (Number.isFinite(amt) ? amt : 0);
  }, 0);
}

function normalizeStoredPaymentMethod(method) {
  if (method === "cash") return "cod";
  if (method === "wallet") return "online";
  return method;
}

function normalizeIncomingPaymentMethod(method) {
  return normalizeStoredPaymentMethod(method);
}

function getRequestCustomerId(request) {
  const c = request.customer;
  if (!c) return null;
  return c._id ? c._id.toString() : String(c);
}

function getRequestProviderId(request) {
  const p = request.provider;
  if (!p) return null;
  return p._id ? p._id.toString() : String(p);
}

function isRequestOwner(request, userId) {
  const cid = getRequestCustomerId(request);
  return cid && userId && cid === userId.toString();
}

function isAssignedProvider(request, userId) {
  const pid = getRequestProviderId(request);
  return pid && userId && pid === userId.toString();
}

function canAccessRequestPayment(req, request) {
  if (!req.user) return false;
  if (req.user.role === "admin") return true;
  if (req.user.role === "customer" && isRequestOwner(request, req.user._id)) {
    return true;
  }
  if (req.user.role === "provider" && isAssignedProvider(request, req.user._id)) {
    return true;
  }
  return false;
}

function getBillSummary(request) {
  const r =
    request && typeof request.toObject === "function"
      ? request.toObject()
      : request;
  const p = r.pricing && typeof r.pricing === "object" ? r.pricing : {};

  if (r.serviceCategory === "mechanic") {
    const baseFee = getNumber(
      r.mechanicBaseFee,
      p.mechanicBaseFee,
      MECHANIC_BASE_FEE
    );
    const distanceKm = getNumber(r.distanceKm, p.distanceKm, 0) ?? 0;
    const perKm = getNumber(
      r.mechanicDistanceFeePerKm,
      p.mechanicDistanceFeePerKm,
      MECHANIC_DISTANCE_FEE_PER_KM
    );
    const distanceFee =
      getNumber(r.mechanicDistanceFee, p.mechanicDistanceFee) ??
      Math.round(distanceKm * perKm * 100) / 100;
    const approvedExtraWork =
      calculateApprovedExtraWorkTotal(r.extraWork) ||
      (getNumber(r.extraWorkTotal, p.extraWorkTotal) ?? 0);
    const totalAmount =
      getNumber(r.totalAmount, p.totalAmount) ??
      (getNumber(baseFee, 0) +
        getNumber(distanceFee, 0) +
        getNumber(approvedExtraWork, 0));

    return {
      baseFee: getNumber(baseFee, 0) ?? 0,
      distanceFee: getNumber(distanceFee, 0) ?? 0,
      approvedExtraWork: getNumber(approvedExtraWork, 0) ?? 0,
      totalAmount: getNumber(totalAmount, 0) ?? 0,
    };
  }

  if (r.serviceCategory === "towing") {
    const towingBaseFee = getNumber(
      r.towingBaseFee,
      p.towingBaseFee,
      r.towingMinimumFee,
      p.towingMinimumFee,
      TOWING_MINIMUM_FEE
    );
    const towingPerKmRate = getNumber(
      r.towingPerKmRate,
      p.towingPerKmRate,
      TOWING_PER_KM_RATE
    );
    const towingDistanceKm =
      getNumber(r.towingDistanceKm, p.towingDistanceKm, 0) ?? 0;
    const distanceCharge =
      getNumber(r.towingDistanceFee, p.towingDistanceFee) ??
      Math.round(towingDistanceKm * (towingPerKmRate ?? TOWING_PER_KM_RATE) * 100) /
        100;
    const totalAmount =
      getNumber(r.totalAmount, p.totalAmount) ??
      (getNumber(towingBaseFee, 0) + getNumber(distanceCharge, 0));

    return {
      towingBaseFee: getNumber(towingBaseFee, 0) ?? 0,
      towingDistanceKm,
      towingPerKmRate: getNumber(towingPerKmRate, TOWING_PER_KM_RATE) ?? 80,
      distanceCharge: getNumber(distanceCharge, 0) ?? 0,
      totalAmount: getNumber(totalAmount, 0) ?? 0,
    };
  }

  if (r.serviceCategory === "fuel_delivery") {
    const fd = r.fuelDetails && typeof r.fuelDetails === "object" ? r.fuelDetails : {};
    const fuelType = fd.fuelType || "petrol";
    const quantityLiters = getNumber(fd.quantityLiters, p.quantityLiters, 0) ?? 0;
    const pricePerLiter =
      getNumber(fd.pricePerLiter, p.pricePerLiter) ??
      (fuelType === "diesel" ? DIESEL_PRICE_PER_LITER : PETROL_PRICE_PER_LITER);
    const fuelAmount =
      getNumber(r.fuelAmount, p.fuelAmount) ??
      Math.round(quantityLiters * pricePerLiter * 100) / 100;
    const deliveryFee =
      getNumber(r.fuelDeliveryFee, p.fuelDeliveryFee, FUEL_DELIVERY_FEE) ??
      FUEL_DELIVERY_FEE;
    const totalAmount =
      getNumber(r.totalAmount, p.totalAmount) ??
      (getNumber(fuelAmount, 0) + getNumber(deliveryFee, 0));

    return {
      fuelType,
      quantityLiters,
      pricePerLiter,
      fuelAmount: getNumber(fuelAmount, 0) ?? 0,
      deliveryFee: getNumber(deliveryFee, 0) ?? 0,
      totalAmount: getNumber(totalAmount, 0) ?? 0,
    };
  }

  return {
    totalAmount: getNumber(r.totalAmount, p.totalAmount, 0) ?? 0,
  };
}

function getRequestAmount(request) {
  const r =
    request && typeof request.toObject === "function"
      ? request.toObject()
      : request;
  const p = r.pricing && typeof r.pricing === "object" ? r.pricing : {};

  const direct = getNumber(r.totalAmount, p.totalAmount);
  if (direct !== null && direct >= 0) {
    return direct;
  }

  const bill = getBillSummary(r);
  if (bill && bill.totalAmount !== undefined && bill.totalAmount !== null) {
    const t = Number(bill.totalAmount);
    if (Number.isFinite(t) && t >= 0) return t;
  }

  return 0;
}

function getCashDescription(serviceCategory) {
  if (serviceCategory === "mechanic") return "Pay to mechanic";
  if (serviceCategory === "towing") return "Pay to driver";
  if (serviceCategory === "fuel_delivery") return "Pay to rider";
  return "Pay to mechanic/driver/rider depending on service";
}

function getOnlineGateways() {
  return [...ONLINE_GATEWAYS];
}

function getPaymentMethodsForRequest(request) {
  const r = request || {};
  const cat = r.serviceCategory;
  return [
    {
      label: "Cash",
      value: "cod",
      description: getCashDescription(cat),
    },
    {
      label: "Online Payment",
      value: "online",
      description: "Pay securely via card / wallet",
      gateways: getOnlineGateways(),
    },
  ];
}

function ensurePaymentAllowedForRequest(request) {
  if (!request) {
    return { ok: false, status: 404, message: "Request not found." };
  }
  if (request.status === "cancelled") {
    return { ok: false, status: 400, message: "Cannot pay for a cancelled request." };
  }
  if (request.paymentStatus === "paid") {
    return { ok: false, status: 400, message: "Payment is already completed." };
  }
  if (
    request.serviceCategory === "mechanic" &&
    request.status === "extra_work_requested"
  ) {
    return {
      ok: false,
      status: 400,
      message:
        "Payment cannot be initiated while extra work is awaiting customer approval.",
    };
  }
  return { ok: true };
}

function buildSummary(request) {
  const rid = request._id ? request._id.toString() : String(request.id);
  const normalizedMethod = normalizeStoredPaymentMethod(request.paymentMethod);
  return {
    requestId: rid,
    serviceCategory: request.serviceCategory,
    serviceType: request.serviceType,
    requestStatus: request.status,
    paymentMethod: normalizedMethod,
    paymentStatus: request.paymentStatus,
    billSummary: getBillSummary(request),
    paymentMethods: getPaymentMethodsForRequest(request),
  };
}

async function getPaymentSummary(req, res) {
  try {
    const { requestId } = req.params;
    if (!isValidObjectId(requestId)) {
      return res.status(400).json({ message: "Invalid request id." });
    }

    const request = await ServiceRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Request not found." });
    }

    if (!canAccessRequestPayment(req, request)) {
      return res.status(403).json({ message: "Access denied." });
    }

    return res.json({
      message: "Payment summary fetched successfully.",
      summary: buildSummary(request),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function initiatePayment(req, res) {
  try {
    const { requestId } = req.params;
    if (!isValidObjectId(requestId)) {
      return res.status(400).json({ message: "Invalid request id." });
    }

    const request = await ServiceRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Request not found." });
    }

    if (!isRequestOwner(request, req.user._id)) {
      return res.status(403).json({ message: "Access denied." });
    }

    const gate = ensurePaymentAllowedForRequest(request);
    if (!gate.ok) {
      return res.status(gate.status).json({ message: gate.message });
    }

    const body = req.body || {};
    const rawMethod = body.paymentMethod;
    const paymentMethod = normalizeIncomingPaymentMethod(rawMethod);

    if (!["cod", "online"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "paymentMethod must be cod or online.",
      });
    }

    let gateway = body.gateway;
    if (paymentMethod === "cod") {
      gateway = "cod";
    } else {
      if (!gateway || typeof gateway !== "string") {
        return res.status(400).json({
          message: "gateway is required for online payment.",
        });
      }
      gateway = gateway.trim();
      if (!ONLINE_GATEWAYS.includes(gateway)) {
        return res.status(400).json({
          message: `gateway must be one of: ${ONLINE_GATEWAYS.join(", ")}.`,
        });
      }
    }

    const amount = getRequestAmount(request);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ message: "Invalid payable amount for this request." });
    }

    const customerId = request.customer;
    const providerId = request.provider || null;

    let payment = await Payment.findOne({
      request: request._id,
      paymentStatus: "pending",
    });

    if (payment) {
      payment.amount = amount;
      payment.paymentMethod = paymentMethod;
      payment.gateway = gateway;
      payment.customer = customerId;
      payment.provider = providerId;
      payment.transactionId = "";
      payment.paidAt = null;
      payment.failedAt = null;
      payment.failureReason = "";
      payment.notes = "";
      await payment.save();
    } else {
      payment = await Payment.create({
        request: request._id,
        customer: customerId,
        provider: providerId,
        amount,
        paymentMethod,
        gateway,
        paymentStatus: "pending",
      });
    }

    request.paymentMethod = paymentMethod;
    request.paymentStatus = "pending";
    await request.save();

    const paymentObj = payment.toObject();

    if (paymentMethod === "cod") {
      return res.status(201).json({
        message: "Cash payment selected. Provider will collect payment.",
        payment: paymentObj,
        nextAction: "Provider will collect payment and complete the job.",
      });
    }

    const pid = payment._id.toString();
    return res.status(201).json({
      message: "Online payment initiated successfully.",
      payment: paymentObj,
      mockCheckout: {
        message:
          "MVP mock payment. Use success or failed endpoint to update payment status.",
        successEndpoint: `/api/payments/${pid}/success`,
        failedEndpoint: `/api/payments/${pid}/failed`,
      },
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

function canAccessPaymentRecord(req, payment) {
  if (!req.user || !payment) return false;
  if (req.user.role === "admin") return true;
  const cust = payment.customer;
  const cid = cust && cust._id ? cust._id.toString() : String(cust);
  if (req.user.role === "customer" && cid === req.user._id.toString()) {
    return true;
  }
  const prov = payment.provider;
  const pid = prov && prov._id ? prov._id.toString() : prov ? String(prov) : null;
  if (req.user.role === "provider" && pid && pid === req.user._id.toString()) {
    return true;
  }
  return false;
}

async function markPaymentSuccess(req, res) {
  try {
    const { paymentId } = req.params;
    if (!isValidObjectId(paymentId)) {
      return res.status(400).json({ message: "Invalid payment id." });
    }

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found." });
    }

    if (!canAccessPaymentRecord(req, payment)) {
      return res.status(403).json({ message: "Access denied." });
    }

    if (req.user.role === "customer") {
      const custId = payment.customer.toString();
      if (custId !== req.user._id.toString()) {
        return res.status(403).json({ message: "Access denied." });
      }
    }

    if (payment.paymentStatus === "paid") {
      return res.status(400).json({ message: "Payment is already marked as paid." });
    }
    if (payment.paymentStatus === "failed" || payment.paymentStatus === "refunded") {
      return res.status(400).json({
        message: "Cannot mark this payment as paid from the current status.",
      });
    }

    const body = req.body || {};
    const tx =
      typeof body.transactionId === "string" && body.transactionId.trim()
        ? body.transactionId.trim()
        : `MOCK-TXN-${Date.now()}`;

    payment.paymentStatus = "paid";
    payment.transactionId = tx;
    payment.paidAt = new Date();
    payment.failedAt = null;
    payment.failureReason = "";
    await payment.save();

    const request = await ServiceRequest.findById(payment.request);
    if (request) {
      request.paymentStatus = "paid";
      request.paymentMethod = payment.paymentMethod;
      await request.save();
    }

    const refreshed = await Payment.findById(paymentId).lean();
    const summaryRequest = request || (await ServiceRequest.findById(payment.request));

    return res.json({
      message: "Payment marked as paid.",
      payment: refreshed,
      summary: summaryRequest ? buildSummary(summaryRequest) : null,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function markPaymentFailed(req, res) {
  try {
    const { paymentId } = req.params;
    if (!isValidObjectId(paymentId)) {
      return res.status(400).json({ message: "Invalid payment id." });
    }

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found." });
    }

    if (!canAccessPaymentRecord(req, payment)) {
      return res.status(403).json({ message: "Access denied." });
    }

    if (req.user.role === "customer") {
      const custId = payment.customer.toString();
      if (custId !== req.user._id.toString()) {
        return res.status(403).json({ message: "Access denied." });
      }
    }

    if (payment.paymentStatus === "paid") {
      return res.status(400).json({
        message: "Paid payment cannot be marked as failed.",
      });
    }
    if (payment.paymentStatus === "failed") {
      return res.status(400).json({
        message: "Payment is already marked as failed.",
      });
    }

    const body = req.body || {};
    const reasonRaw = body.reason;
    const reason =
      typeof reasonRaw === "string" && reasonRaw.trim()
        ? reasonRaw.trim()
        : "Payment failed.";

    payment.paymentStatus = "failed";
    payment.failedAt = new Date();
    payment.failureReason = reason;
    await payment.save();

    const request = await ServiceRequest.findById(payment.request);
    if (request) {
      request.paymentStatus = "failed";
      await request.save();
    }

    const refreshed = await Payment.findById(paymentId).lean();
    const summaryRequest = request || (await ServiceRequest.findById(payment.request));

    return res.json({
      message: "Payment marked as failed.",
      payment: refreshed,
      summary: summaryRequest ? buildSummary(summaryRequest) : null,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function listMyPayments(req, res) {
  try {
    const user = req.user;
    let query = {};

    if (user.role === "admin") {
      query = {};
    } else if (user.role === "customer") {
      query = { customer: user._id };
    } else if (user.role === "provider") {
      query = { provider: user._id };
    } else {
      return res.status(403).json({ message: "Access denied." });
    }

    const selectRequest =
      "serviceCategory serviceType status paymentStatus paymentMethod totalAmount pricing vehicleInfo";

    const list = await Payment.find(query)
      .sort({ createdAt: -1 })
      .populate("request", selectRequest)
      .populate("customer", "name email phone")
      .populate("provider", "name phone providerType")
      .lean();

    return res.json({
      message: "OK",
      count: list.length,
      payments: list,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function getPaymentById(req, res) {
  try {
    const { paymentId } = req.params;
    if (!isValidObjectId(paymentId)) {
      return res.status(400).json({ message: "Invalid payment id." });
    }

    const payment = await Payment.findById(paymentId)
      .populate("request")
      .populate("customer", "name email phone")
      .populate("provider", "name phone providerType");

    if (!payment) {
      return res.status(404).json({ message: "Payment not found." });
    }

    let reqDoc = payment.request;
    if (!reqDoc || !reqDoc._id) {
      reqDoc = await ServiceRequest.findById(payment.request);
    }

    if (!reqDoc) {
      if (req.user.role === "admin") {
        return res.json({ message: "OK", payment: payment.toObject() });
      }
      const custId = payment.customer.toString();
      if (req.user.role === "customer" && custId === req.user._id.toString()) {
        return res.json({ message: "OK", payment: payment.toObject() });
      }
      return res.status(403).json({ message: "Access denied." });
    }

    if (!canAccessRequestPayment(req, reqDoc)) {
      return res.status(403).json({ message: "Access denied." });
    }

    return res.json({
      message: "OK",
      payment: payment.toObject(),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

module.exports = {
  isValidObjectId,
  getNumber,
  getRequestAmount,
  getRequestCustomerId,
  getRequestProviderId,
  isRequestOwner,
  isAssignedProvider,
  canAccessRequestPayment,
  normalizeStoredPaymentMethod,
  normalizeIncomingPaymentMethod,
  getCashDescription,
  getOnlineGateways,
  getPaymentMethodsForRequest,
  getBillSummary,
  ensurePaymentAllowedForRequest,
  buildSummary,
  getPaymentSummary,
  initiatePayment,
  markPaymentSuccess,
  markPaymentFailed,
  listMyPayments,
  getPaymentById,
};
