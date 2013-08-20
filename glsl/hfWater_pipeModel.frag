//GPU version of pipe model water - pass to propagate water height after flux has been calculated
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTerrainTexture;
uniform sampler2D uWaterTexture;
uniform sampler2D uFluxTexture;
uniform vec2 uTexelSize;
uniform float uSegmentSizeSquared;
uniform float uDt;
uniform float uMinHeight;

varying vec2 vUv;

void main() {

    vec2 du = vec2(uTexelSize.r, 0.0);
    vec2 dv = vec2(0.0, uTexelSize.g);

    //read terrain texture
    //r channel: height
    vec4 tTerrain = texture2D(uTerrainTexture, vUv);

    //read water texture
    //r channel: combined height
    //g, b channels: vel
    vec4 tWater = texture2D(uWaterTexture, vUv);

    float waterHeight = tWater.r - tTerrain.r;

    //read flux texture
    //r channel: fluxR
    //g channel: fluxL
    //b channel: fluxB
    //a channel: fluxT
    vec4 tFlux = texture2D(uFluxTexture, vUv);

    //calculate new height
    float fluxOut = tFlux.r + tFlux.g + tFlux.b + tFlux.a;
    float fluxIn = texture2D(uFluxTexture, vUv-du).r
                    + texture2D(uFluxTexture, vUv+du).g
                    + texture2D(uFluxTexture, vUv+dv).b
                    + texture2D(uFluxTexture, vUv-dv).a;
    float dV = (fluxIn - fluxOut) * uDt;
    waterHeight += dV / (uSegmentSizeSquared);
    waterHeight = max(uMinHeight, waterHeight);

    //TODO: calculate horizontal velocities

    //store total height back into red channel
    tWater.r = tTerrain.r + waterHeight;

    //write out to texture for next step
    gl_FragColor = vec4(tWater.rgb, 1.0);
}