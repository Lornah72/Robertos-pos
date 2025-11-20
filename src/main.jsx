import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import SupermarketPOS from "./SupermarketPOS.jsx";
import "./index.css";

// super-light hash switch (no router library)
function Root() {
  const isSupermarket = window.location.hash.startsWith("#/supermarket");
  const [flag, setFlag] = React.useState(isSupermarket);

  React.useEffect(() => {
    const onHash = () => setFlag(window.location.hash.startsWith("#/supermarket"));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return flag ? <SupermarketPOS /> : <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
