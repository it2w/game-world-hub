import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react/custom-fetch";

// In the desktop shell the app is loaded from file:// and must call the
// bundled API server over an absolute URL. In the browser, requests stay
// relative to the current origin.
if (window.electronAPI?.apiBaseUrl) {
  setBaseUrl(window.electronAPI.apiBaseUrl);
}

// The API client uses customFetch, which can inject the token automatically.
setAuthTokenGetter(() => {
  return localStorage.getItem("gwh_token");
});
