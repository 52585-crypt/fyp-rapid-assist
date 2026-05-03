const ACCESS_COOKIE_NAME = "accessToken";
const REFRESH_COOKIE_NAME = "refreshToken";

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  };
}

function setAuthCookies(res, accessToken, refreshToken) {
  const base = cookieOptions();
  res.cookie(ACCESS_COOKIE_NAME, accessToken, {
    ...base,
    maxAge: ACCESS_MAX_AGE_MS,
  });
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...base,
    maxAge: REFRESH_MAX_AGE_MS,
  });
}

function setAccessTokenCookie(res, accessToken) {
  const base = cookieOptions();
  res.cookie(ACCESS_COOKIE_NAME, accessToken, {
    ...base,
    maxAge: ACCESS_MAX_AGE_MS,
  });
}

function clearAuthCookies(res) {
  const base = cookieOptions();
  res.clearCookie(ACCESS_COOKIE_NAME, { ...base });
  res.clearCookie(REFRESH_COOKIE_NAME, { ...base });
}

module.exports = {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  setAuthCookies,
  setAccessTokenCookie,
  clearAuthCookies,
};
