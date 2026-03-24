import { BrowserRouter, Routes, Route } from "react-router-dom";
import { BookshelfPage } from "./pages/BookshelfPage";
import { BookDetailPage } from "./pages/BookDetailPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BookshelfPage />} />
        <Route path="/book/:bookId" element={<BookDetailPage />} />
        <Route path="/book/:bookId/:step" element={<BookDetailPage />} />
      </Routes>
    </BrowserRouter>
  );
}
