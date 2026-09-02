// The mark itself is a 400×600 shape (Figma's icon is naturally taller than
// wide) sitting inside a 1024×1280 canvas — most of that canvas is white
// padding. Cropped here to a tight 600×600 square centered on the mark
// (312–712 horizontally, exactly 340–940 vertically already) instead of
// using the full canvas, so it reads as a proper square icon.
export function FigmaLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="212 340 600 600" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M312 840C312 784.772 356.772 740 412 740H512V840C512 895.228 467.228 940 412 940C356.772 940 312 895.228 312 840Z"
        fill="#24CB71"
      />
      <path
        d="M512 340V540H612C667.228 540 712 495.228 712 440C712 384.772 667.228 340 612 340H512Z"
        fill="#FF7237"
      />
      <path
        d="M611.167 740C666.395 740 711.167 695.228 711.167 640C711.167 584.772 666.395 540 611.167 540C555.939 540 511.167 584.772 511.167 640C511.167 695.228 555.939 740 611.167 740Z"
        fill="#00B6FF"
      />
      <path
        d="M312 440C312 495.228 356.772 540 412 540H512V340H412C356.772 340 312 384.772 312 440Z"
        fill="#FF3737"
      />
      <path
        d="M312 640C312 695.228 356.772 740 412 740H512V540H412C356.772 540 312 584.772 312 640Z"
        fill="#874FFF"
      />
    </svg>
  );
}
