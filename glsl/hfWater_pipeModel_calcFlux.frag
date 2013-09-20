//GPU version of pipe model water.
//This is the pre-pass to calculate flux.
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTerrainTexture;
uniform sampler2D uWaterTexture;
uniform sampler2D uFluxTexture;
uniform sampler2D uObstaclesTexture;
uniform sampler2D uBoundaryTexture;
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
    //a channel: UNUSED
    vec4 tWater = texture2D(uWaterTexture, vUv);

    float waterHeight = tWater.r;
    float totalHeight = tTerrain.r + waterHeight;

    //read flux texture
    //r channel: fluxR
    //g channel: fluxL
    //b channel: fluxB
    //a channel: fluxT
    vec4 tFlux = texture2D(uFluxTexture, vUv);

    //calculate new flux
    tFlux *= uDampingFactor;
    vec4 neighbourTotalHeights = vec4(texture2D(uWaterTexture, vUv + du).r + texture2D(uTerrainTexture, vUv + du).r,
                                      texture2D(uWaterTexture, vUv - du).r + texture2D(uTerrainTexture, vUv - du).r,
                                      texture2D(uWaterTexture, vUv - dv).r + texture2D(uTerrainTexture, vUv - dv).r,
                                      texture2D(uWaterTexture, vUv + dv).r + texture2D(uTerrainTexture, vUv + dv).r);
    tFlux += (totalHeight - neighbourTotalHeights) * uHeightToFluxFactor;
    tFlux = max(vec4(0.0), tFlux);

    //read boundary texture
    //r channel: fluxR
    //g channel: fluxL
    //b channel: fluxB
    //a channel: fluxT
    vec4 tBoundary = texture2D(uBoundaryTexture, vUv);

    //multiply flux with boundary texture to mask out fluxes
    tFlux *= tBoundary;

    //read obstacle texture
    //r channel: whether water is in obstacle
    vec4 tObstacle = texture2D(uObstaclesTexture, vUv);

    //stop flow velocity if pipe flows to an obstacle
    //TODO: obstacles for pipe model water
    // tFlux *= 1.0 - tObstacle.r;
    // if (texture2D(uObstaclesTexture, vUv + du).r > 0.1) {
        // tFlux.r = 0.0;
    // }
    // if (texture2D(uObstaclesTexture, vUv - du).r > 0.1) {
        // tFlux.g = 0.0;
    // }
    // if (texture2D(uObstaclesTexture, vUv - dv).r > 0.1) {
        // tFlux.b = 0.0;
    // }
    // if (texture2D(uObstaclesTexture, vUv + dv).r > 0.1) {
        // tFlux.a = 0.0;
    // }

    //scale down outflow if it is more than available volume in the column
    float currVol = (waterHeight - uMinWaterHeight) * uSegmentSizeSquared;
    float outVol = uDt * (tFlux.r + tFlux.g + tFlux.b + tFlux.a);
    tFlux *= min(1.0, currVol / outVol);

    //write out to texture for next step
    gl_FragColor = tFlux;
}