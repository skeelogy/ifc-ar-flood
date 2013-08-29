//GPU version of "Interactive Water Surfaces" (Jerry Tessendorf, Game Programming Gems 4).
//This is the convolution pre-pass to find the vertical derivative.
//author: Skeel Lee <skeel@skeelogy.com>

//have to use #define here to get compile-time constant values,
//otherwise there are problems in the double-for-loop and indexing into array.
//remember to change this radius value after changing that in the GpuTessendorfIWaveWater class.
#define KERNEL_RADIUS 2
#define KERNEL_WIDTH (2 * (KERNEL_RADIUS) + 1)

uniform sampler2D uWaterTexture;
uniform vec2 uTexelSize;
uniform float uKernel[KERNEL_WIDTH * KERNEL_WIDTH];

varying vec2 vUv;

void main() {

    //read water texture
    //r channel: height
    //g channel: prev height
    //b channel: vertical derivative
    //a channel: prev mean height
    vec4 tWater = texture2D(uWaterTexture, vUv);

    //propagate
    tWater.b = 0.0;
    float fk, fl;
    vec4 tWaterNeighbour;
    for (int k = -KERNEL_RADIUS; k <= KERNEL_RADIUS; k++) {
        fk = float(k);
        for (int l = -KERNEL_RADIUS; l <= KERNEL_RADIUS; l++) {
            fl = float(l);
            tWaterNeighbour = texture2D(uWaterTexture, vec2(vUv.r + fk * uTexelSize.r, vUv.g + fl * uTexelSize.g));
            tWater.b += uKernel[(k + KERNEL_RADIUS) * KERNEL_WIDTH + (l + KERNEL_RADIUS)] * (tWaterNeighbour.r - tWaterNeighbour.a);
        }
    }

    //write out to texture for next step
    gl_FragColor = tWater;
}