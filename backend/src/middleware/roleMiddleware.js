function allowRoles(...roles) {
    return function (req, res, next) {
      if (!req.user) {
        return res.status(401).json({
          message: "Not authorized.",
        });
      }
  
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          message: "Access denied.",
        });
      }
  
      next();
    };
  }
  
  function allowProviderTypes(...providerTypes) {
    return function (req, res, next) {
      if (!req.user) {
        return res.status(401).json({
          message: "Not authorized.",
        });
      }
  
      if (req.user.role !== "provider") {
        return res.status(403).json({
          message: "Only service providers can access this route.",
        });
      }
  
      if (!providerTypes.includes(req.user.providerType)) {
        return res.status(403).json({
          message: "Provider type not allowed.",
        });
      }
  
      next();
    };
  }
  
  module.exports = {
    allowRoles,
    allowProviderTypes,
  };