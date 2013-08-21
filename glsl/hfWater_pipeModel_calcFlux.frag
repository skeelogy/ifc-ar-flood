//GPU version of pipe model water - pass to calculate flux
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTerrainTexture;
uniform sampler2D uWaterTexture;
uniform sampler2D uFluxTexture;
uniform vec2 uTexelSize;
uniform float uDampingFactor;
uniform float uHeightToFluxFactor;
uniform float uSegmentSizeSquared;
uniform float uDt;
uniform float uMinWaterHeight;

varying vec2 vUv;

void main() {

    vec2 du = vec2(uTexelSize.r, 0.0);
    vec2 dv = vec2(0.0, uTexelSize.g);

    //read terrain texture
    //r channel: terrain height
    vec4 tTerrain = texture2D(uTerrainTexture, vUv);

    //read water texture
    //r channel: water height
    //g, b channels: vel
    vec4 tWater = texture2D(uWaterTexture, vUv);

    float waterHeight = tWater.r;
    float totalHeight = tTerrain.r + waterHeight;

    //read flux texture
    //r channel: fluxR
    //g channel: fluxL
    //b channel: fluxB
    //a channel: fluxT
    vec4 tFlux = texture2D(uFluxTexture, vUv);

    if (waterHeight <= uMinWaterHeight) {
        tFlux.r = 0.0;
        tFlux.g = 0.0;
        tFlux.b = 0.0;
        tFlux.a = 0.0;
    } else {
        tFlux *= uDampingFactor;
        vec4 neighbourTotalHeights = vec4(texture2D(uWaterTexture, vUv + du).r + texture2D(uTerrainTexture, vUv + du).r,
                                          texture2D(uWaterTexture, vUv - du).r + texture2D(uTerrainTexture, vUv - du).r,
                                          texture2D(uWaterTexture, vUv - dv).r + texture2D(uTerrainTexture, vUv - dv).r,
                                          texture2D(uWaterTexture, vUv + dv).r + texture2D(uTerrainTexture, vUv + dv).r);
        tFlux += (totalHeight - neighbourTotalHeights) * uHeightToFluxFactor;
        tFlux = max(vec4(0.0), tFlux);
    }

    //TODO: set flux to boundaries to zero

    //TODO: stop flow velocity if pipe flows to an obstacle

    //scale down outflow if it is more than available volume in the column
    float currVol = (waterHeight - uMinWaterHeight) * uSegmentSizeSquared;
    float outVol = uDt * (tFlux.r + tFlux.g + tFlux.b + tFlux.a);
    tFlux *= min(1.0, currVol / outVol);

    //write out to texture for next step
    gl_FragColor = tFlux;
}