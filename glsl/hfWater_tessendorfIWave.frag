//GPU version of "Interactive Water Surfaces" (Jerry Tessendorf, Game Programming Gems 4).
//Need to run convolve fragment shader first before running this.
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uWaterTexture;
uniform float uTwoMinusDampTimesDt;
uniform float uOnePlusDampTimesDt;
uniform float uGravityTimesDtTimesDt;

varying vec2 vUv;

void main() {

    //read water texture
    //r channel: height
    //g channel: prev height
    //b channel: vertical derivative
    vec4 tWater = texture2D(uWaterTexture, vUv);

    float temp = tWater.r;
    tWater.r = (tWater.r * uTwoMinusDampTimesDt
               - tWater.g
               - tWater.b * uGravityTimesDtTimesDt) / uOnePlusDampTimesDt;
    tWater.g = temp;

    //write out to texture for next step
    gl_FragColor = vec4(tWater.rgb, 1.0);
}