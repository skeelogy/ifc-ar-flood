//GPU version of pipe model water - pass to propagate water height after flux has been calculated
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uHeightTexture;
uniform sampler2D uFluxTexture;
uniform vec2 uTexelSize;
uniform float uSegmentSizeSquared;
uniform float uDt;

varying vec2 vUv;

void main() {

    vec2 du = vec2(uTexelSize.r, 0.0);
    vec2 dv = vec2(0.0, uTexelSize.g);

    //read height texture
    //r channel: height
    //g, b channels: vel
    vec4 tHeight = texture2D(uHeightTexture, vUv);

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
    tHeight.r += dV / (uSegmentSizeSquared);
    tHeight.r = max(0.0, tHeight.r);

    //write out to texture for next step
    gl_FragColor = vec4(tHeight.rgba);
}