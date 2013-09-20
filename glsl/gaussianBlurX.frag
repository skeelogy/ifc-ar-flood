//Fragment shader gaussian blur (horizontal pass)
//author: Skeel Lee <skeel@skeelogy.com>
//Largely obtained from:
//http://www.gamerendering.com/2008/10/11/gaussian-blur-filter-shader/

uniform sampler2D uTexture;
uniform float uTexelSize;

varying vec2 vUv;

void main() {

    vec4 sum = vec4(0.0);

    // blur in x (horizontal)
    // take nine samples, with the distance uTexelSize between them
    sum += texture2D(uTexture, vec2(vUv.x - 4.0 * uTexelSize, vUv.y)) * 0.05;
    sum += texture2D(uTexture, vec2(vUv.x - 3.0 * uTexelSize, vUv.y)) * 0.09;
    sum += texture2D(uTexture, vec2(vUv.x - 2.0 * uTexelSize, vUv.y)) * 0.12;
    sum += texture2D(uTexture, vec2(vUv.x - uTexelSize, vUv.y)) * 0.15;
    sum += texture2D(uTexture, vec2(vUv.x, vUv.y)) * 0.16;
    sum += texture2D(uTexture, vec2(vUv.x + uTexelSize, vUv.y)) * 0.15;
    sum += texture2D(uTexture, vec2(vUv.x + 2.0 * uTexelSize, vUv.y)) * 0.12;
    sum += texture2D(uTexture, vec2(vUv.x + 3.0 * uTexelSize, vUv.y)) * 0.09;
    sum += texture2D(uTexture, vec2(vUv.x + 4.0 * uTexelSize, vUv.y)) * 0.05;

    gl_FragColor = sum;
}