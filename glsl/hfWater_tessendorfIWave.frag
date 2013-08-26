//GPU version of "Interactive Water Surfaces" (Jerry Tessendorf, Game Programming Gems 4).
//Need to run convolve fragment shader first before running this.
//author: Skeel Lee <skeel@skeelogy.com>

//NOTE: I have added in mean height in the calculations, purely because of the flooding system.
//It is not necessary if you do not need to rise the water level.

uniform sampler2D uWaterTexture;
uniform float uTwoMinusDampTimesDt;
uniform float uOnePlusDampTimesDt;
uniform float uGravityTimesDtTimesDt;
uniform float uMeanHeight;

varying vec2 vUv;

void main() {

    //read water texture
    //r channel: height
    //g channel: prev height
    //b channel: vertical derivative
    //a channel: prev mean height
    vec4 tWater = texture2D(uWaterTexture, vUv);

    //remove previous mean height first to bring back to 0 height
    tWater.r -= tWater.a;

    //propagate
    float temp = tWater.r;
    tWater.r = (tWater.r * uTwoMinusDampTimesDt
               - tWater.g
               - tWater.b * uGravityTimesDtTimesDt) / uOnePlusDampTimesDt;
    tWater.g = temp;

    //add new mean height
    tWater.r += uMeanHeight;

    //store new mean height
    tWater.a = uMeanHeight;

    //write out to texture for next step
    gl_FragColor = tWater;
}