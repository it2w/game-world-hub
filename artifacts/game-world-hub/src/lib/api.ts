import { setAuthTokenGetter } from "@workspace/api-client-react/custom-fetch";

// The API client uses customFetch, which can inject the token automatically.
setAuthTokenGetter(() => {
  return localStorage.getItem("gwh_token");
});
