import { Toaster } from "react-hot-toast";
import Router from "./assets/router";

export default function App() {
  return (
    <>
      <Router />
      <Toaster position="top-center" />
    </>
  );
}
