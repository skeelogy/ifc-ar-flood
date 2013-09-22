//Fragment shader erode. This is just a simple 1-pixel erosion based on min.
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;
uniform float uTexelSize;

varying vec2 vUv;

void main() {

    vec2 du = vec2(uTexelSize, 0.0);
    vec2 dv = vec2(0.0, uTexelSize);

    //get current and neighbour pixel values
    float curr = texture2D(uTexture, vUv).r;
    float right = texture2D(uTexture, vUv + du).r;
    float left = texture2D(uTexture, vUv - du).r;
    float bottom = texture2D(uTexture, vUv - dv).r;
    float top = texture2D(uTexture, vUv + dv).r;

    //take min
    float result = min(curr, min(right, min(left, min(bottom, top))));

    gl_FragColor = vec4(result, 0.0, 0.0, 1.0);
}