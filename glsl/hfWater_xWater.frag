//GPU version of X Water

uniform sampler2D uTexture;
// uniform vec2 uTexture;
varying vec2 vUv;

void main() {
    //just read the texture in for now
    vec4 t = texture2D(uTexture, vUv);
    gl_FragColor = vec4(t.rgb, 1.0);
}