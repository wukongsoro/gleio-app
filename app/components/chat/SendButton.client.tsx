import { AnimatePresence, cubicBezier, motion } from 'framer-motion';

interface SendButtonProps {
  show: boolean;
  isStreaming?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
}

const customEasingFn = cubicBezier(0.4, 0, 0.2, 1);

export function SendButton({ show, isStreaming, onClick }: SendButtonProps) {
  return (
    <AnimatePresence>
      {show ? (
        <motion.button
          className="absolute top-1/2 -translate-y-1/2 right-4 flex justify-center items-center p-2.5 bg-conformity-elements-accent-primary hover:bg-conformity-elements-accent-secondary text-white rounded-lg w-10 h-10 transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-xl border border-conformity-elements-accent-primary/50 hover:border-conformity-elements-accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
          transition={{ ease: customEasingFn, duration: 0.2 }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          onClick={(event) => {
            event.preventDefault();
            onClick?.(event);
          }}
          title={isStreaming ? "Stop generation" : "Send message"}
        >
          <div className="text-lg">
            {!isStreaming ? (
              <div className="i-ph:arrow-right font-bold"></div>
            ) : (
              <div className="i-ph:stop-circle font-bold"></div>
            )}
          </div>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
