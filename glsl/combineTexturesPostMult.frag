//Fragment shader to combine textures
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture1;
uniform sampler2D uTexture2;
uniform sampler2D uMultiplyTexture;

varying vec2 vUv;

void main() {

    vec4 t = texture2D(uTexture1, vUv) + texture2D(uTexture2, vUv);

    //read multiply texture and multiply
    vec4 tMultiply = texture2D(uMultiplyTexture, vUv);
    t *= tMultiply;

    gl_FragColor = t;
}