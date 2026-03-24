import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api, type BookData } from "../utils/api";
import { Stepper } from "../components/Stepper";
import { Step1Parse } from "./steps/Step1Parse";
import { Step2Edit } from "./steps/Step2Edit/Step2Edit";
import { Step3Render } from "./steps/Step3Render";

function resolveStep(book: BookData, paramStep?: string): number {
  if (paramStep === "edit") return 1;
  if (paramStep === "render") return 2;
  // Stay on step 0 (parsing) while preprocessing
  if (book.status === "parsing" || book.status === "preprocessing" || book.status === "processing_chapters") return 0;
  if (book.status === "parsed" || book.status === "importing") return 1;
  return 1;
}

export function BookDetailPage() {
  const { bookId, step: paramStep } = useParams<{ bookId: string; step?: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<BookData | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookId) return;
    api.getBook(bookId).then((b) => {
      setBook(b);
      setStep(resolveStep(b, paramStep));
    }).catch((e) => setError(String(e)));
  }, [bookId, paramStep]);

  // Poll while parsing or preprocessing
  useEffect(() => {
    if (!book || (book.status !== "parsing" && book.status !== "preprocessing" && book.status !== "processing_chapters")) return;
    const interval = setInterval(async () => {
      try {
        const updated = await api.getBook(book.id);
        // Always update book data first
        setBook(updated);
        // Stop polling when status changes to parsed
        if (updated.status === "parsed" || updated.status === "ready") {
          clearInterval(interval);
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [book?.status]);

  // Switch to edit step when book status changes to parsed/ready
  useEffect(() => {
    if (book && (book.status === "parsed" || book.status === "ready")) {
      setStep(1);
    }
  }, [book?.status]);

  const goToStep = (s: number) => {
    setStep(s);
    const paths = ["", "edit", "render"];
    navigate(`/book/${bookId}/${paths[s] || ""}`, { replace: true });
  };

  if (error) {
    return (
      <div className="min-h-screen bg-ink-gradient flex items-center justify-center">
        <div className="text-red-300 font-sans text-sm">{error}</div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="min-h-screen bg-ink-gradient flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-ink-gradient relative z-10">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-ink-600/50 px-8 py-4 flex items-center gap-6">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-parchment-dim hover:text-parchment transition-colors text-sm font-sans"
        >
          <ArrowLeft size={16} />
          书架
        </button>

        <div className="h-4 w-px bg-ink-600" />

        <div className="flex-1 min-w-0">
          <h1 className="text-parchment font-serif text-lg truncate">{book.title}</h1>
        </div>

        <Stepper current={step} onChange={goToStep} />
      </header>

      {/* Step content */}
      <main className="flex-1 overflow-hidden relative z-10">
        {step === 0 && (
          <Step1Parse book={book} onParsed={(updated) => { setBook(updated); setStep(1); }} />
        )}
        {step === 1 && (
          <Step2Edit
            book={book}
            onBookUpdate={setBook}
            onContinue={() => goToStep(2)}
          />
        )}
        {step === 2 && (
          <Step3Render book={book} onBookUpdate={setBook} />
        )}
      </main>
    </div>
  );
}
