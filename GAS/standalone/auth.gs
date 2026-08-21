function validateWebhookSecret(e) {
  var configured = APP_CONFIG.line.webhookSecret;
  if (!configured) {
    return true;
  }
  var incoming = e && e.parameter ? String(e.parameter.secret || "") : "";
  return configured === incoming;
}

function validateLineSignature(bodyString, lineSignature) {
  var secret = APP_CONFIG.line.channelSecret;
  if (!secret) {
    return true;
  }
  if (!lineSignature) {
    return false;
  }

  var signatureBytes = Utilities.computeHmacSha256Signature(bodyString, secret);
  var computed = Utilities.base64Encode(signatureBytes);
  return computed === lineSignature;
}

function verifyLiffToken(token) {
  if (!APP_CONFIG.auth.liffTokenVerifyEnabled) {
    return true;
  }
  return !!token;
}
