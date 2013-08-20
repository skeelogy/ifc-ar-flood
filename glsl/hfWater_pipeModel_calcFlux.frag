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
uniform float uMinHeight;

varying vec2 vUv;

void main() {

    vec2 du = vec2(uTexelSize.r, 0.0);
    vec2 dv = vec2(0.0, uTexelSize.g);

    //read terrain texture
    //r channel: height
    vec4 tTerrain = texture2D(uTerrainTexture, vUv);

    //read water texture
    //r channel: total height
    //g, b channels: vel
    vec4 tWater = texture2D(uWaterTexture, vUv);

    float totalHeight = tWater.r;
    float waterHeight = totalHeight - tTerrain.r;

    //read flux texture
    //r channel: fluxR
    //g channel: fluxL
    //b channel: fluxB
    //a channel: fluxT
    vec4 tFlux = texture2D(uFluxTexture, vUv);

    //damp all fluxes
    tFlux *= uDampingFactor;

    vec2 offsetUv;
    float dHeight;

    if (waterHeight <= uMinHeight) {

        tFlux.r = 0.0;
        tFlux.g = 0.0;
        tFlux.b = 0.0;
        tFlux.a = 0.0;

    } else {

        //calculate flux R
        offsetUv = vUv + du;
        dHeight = totalHeight - (texture2D(uWaterTexture, offsetUv).r);
        tFlux.r += dHeight * uHeightToFluxFactor;
        tFlux.r = max(0.0, tFlux.r);

        //calculate flux L
        offsetUv = vUv - du;
        dHeight = totalHeight - (texture2D(uWaterTexture, offsetUv).r);
        tFlux.g += dHeight * uHeightToFluxFactor;
        tFlux.g = max(0.0, tFlux.g);

        //calculate flux B
        offsetUv = vUv - dv;
        dHeight = totalHeight - (texture2D(uWaterTexture, offsetUv).r);
        tFlux.b += dHeight * uHeightToFluxFactor;
        tFlux.b = max(0.0, tFlux.b);

        //calculate flux T
        offsetUv = vUv + dv;
        dHeight = totalHeight - (texture2D(uWaterTexture, offsetUv).r);
        tFlux.a += dHeight * uHeightToFluxFactor;
        tFlux.a = max(0.0, tFlux.a);
    }

    //TODO: set flux to boundaries to zero

    //TODO: stop flow velocity if pipe flows to an obstacle

    //scale down outflow if it is more than available volume in the column
    float currVol = (waterHeight - uMinHeight) * uSegmentSizeSquared;
    float outVol = uDt * (tFlux.r + tFlux.g + tFlux.b + tFlux.a);
    tFlux *= min(1.0, currVol / outVol);

    //write out to texture for next step
    gl_FragColor = vec4(tFlux.rgba);
}