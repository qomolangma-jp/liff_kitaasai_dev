function doGet(e) {
  return routeRequest("GET", e, null);
}

function doPost(e) {
  var payload = parseRequestBody(e);
  return routeRequest("POST", e, payload);
}

function parseRequestBody(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}
