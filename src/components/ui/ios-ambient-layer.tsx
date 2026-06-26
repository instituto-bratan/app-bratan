"use client";

import { motion } from "framer-motion";

function IOSAmbientLayer() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <motion.div
        className="absolute inset-x-0 top-0 h-[46vh] bg-[linear-gradient(115deg,rgba(255,255,255,0.72)_0%,rgba(248,237,189,0.42)_30%,rgba(122,137,94,0.18)_52%,rgba(255,255,255,0.52)_74%,transparent_100%)] opacity-80 blur-2xl"
        animate={{
          x: ["-8%", "5%", "-4%"],
          y: ["-12%", "-5%", "-10%"],
          opacity: [0.72, 0.9, 0.76],
        }}
        transition={{ duration: 15, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-x-0 bottom-0 h-[40vh] bg-[linear-gradient(35deg,rgba(77,86,59,0.13)_0%,rgba(255,255,255,0.55)_42%,rgba(198,168,98,0.20)_100%)] opacity-70 blur-2xl"
        animate={{
          x: ["6%", "-5%", "4%"],
          y: ["10%", "3%", "8%"],
          opacity: [0.58, 0.76, 0.62],
        }}
        transition={{ duration: 18, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.16)_1px,transparent_1px)] bg-[size:48px_48px] opacity-[0.18]" />
    </div>
  );
}

export { IOSAmbientLayer };
