//Fragment shader to combine textures
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture1;
uniform sampler2D uTexture2;

varying vec2 vUv;

void main() {

    //read textures
    vec4 t = texture2D(uTexture1, vUv) + texture2D(uTexture2, vUv);

    //write out to texture for next step
    gl_FragColor = vec4(t.rgb, 1.0);
}