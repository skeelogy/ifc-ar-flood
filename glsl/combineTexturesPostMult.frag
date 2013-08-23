//Fragment shader to combine textures
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture1;
uniform sampler2D uTexture2;
uniform sampler2D uMultiplyTexture;  //texture to multiply the results of uTexture1 + uTexture2
uniform float uMaskOffset;  //using uMultiplyTexture as a mask to offset the 0 regions

varying vec2 vUv;

void main() {

    vec4 t = texture2D(uTexture1, vUv) + texture2D(uTexture2, vUv);

    //read multiply texture and multiply
    vec4 tMultiply = texture2D(uMultiplyTexture, vUv);
    t *= tMultiply;

    //do offset with masking
    t += (1.0 - tMultiply) * uMaskOffset;

    gl_FragColor = t;
}