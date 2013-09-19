//GPU version of pipe model water.
//Need to run the flux calculation pre-pass first before running this.
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uWaterTexture;
uniform sampler2D uFluxTexture;
uniform vec2 uTexelSize;
uniform float uSegmentSize;
uniform float uDt;
uniform float uMinWaterHeight;

varying vec2 vUv;

void main() {

    vec2 du = vec2(uTexelSize.r, 0.0);
    vec2 dv = vec2(0.0, uTexelSize.g);

    //read water texture
    //r channel: water height
    //g channel: horizontal velocity x
    //b channel: horizontal velocity z
    //a channel: UNUSED
    vec4 tWater = texture2D(uWaterTexture, vUv);

    //read flux textures
    //r channel: fluxR
    //g channel: fluxL
    //b channel: fluxB
    //a channel: fluxT
    vec4 tFlux = texture2D(uFluxTexture, vUv);
    vec4 tFluxPixelLeft = texture2D(uFluxTexture, vUv-du);
    vec4 tFluxPixelRight = texture2D(uFluxTexture, vUv+du);
    vec4 tFluxPixelTop = texture2D(uFluxTexture, vUv+dv);
    vec4 tFluxPixelBottom = texture2D(uFluxTexture, vUv-dv);

    float avgWaterHeight = tWater.r;

    //calculate new height
    float fluxOut = tFlux.r + tFlux.g + tFlux.b + tFlux.a;
    float fluxIn = tFluxPixelLeft.r + tFluxPixelRight.g + tFluxPixelTop.b + tFluxPixelBottom.a;
    tWater.r += (fluxIn - fluxOut) * uDt / (uSegmentSize * uSegmentSize);
    tWater.r = max(uMinWaterHeight, tWater.r);

    avgWaterHeight = 0.5 * (avgWaterHeight + tWater.r);  //this will get the average height of that from before and after the change

    //calculate horizontal velocities, from amount of water passing through per unit time
    if (avgWaterHeight == 0.0) {  //prevent division by 0
        tWater.g = 0.0;
        tWater.b = 0.0;
    } else {
        float threshold = float(tWater.r > 0.2);  //0/1 threshold value for masking out weird velocities at terrain edges
        float segmentSizeTimesAvgWaterHeight = uSegmentSize * avgWaterHeight;
        tWater.g = threshold * 0.5 * (tFluxPixelLeft.r - tFlux.g + tFlux.r - tFluxPixelRight.g) / segmentSizeTimesAvgWaterHeight;
        tWater.b = threshold * 0.5 * (tFluxPixelTop.b - tFlux.a + tFlux.b - tFluxPixelBottom.a) / segmentSizeTimesAvgWaterHeight;
    }

    //write out to texture for next step
    gl_FragColor = tWater;
}