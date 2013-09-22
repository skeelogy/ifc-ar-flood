//Fragment shader to combine textures
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTerrainTexture;
uniform sampler2D uStaticObstaclesTexture;
uniform sampler2D uWaterTexture;
uniform sampler2D uMultiplyTexture;  //texture to multiply the results of uTerrainTexture + uStaticObstaclesTexture
uniform float uMaskOffset;  //using uMultiplyTexture as a mask to offset the 0 regions

varying vec2 vUv;

void main() {

    vec4 t = max(texture2D(uTerrainTexture, vUv), texture2D(uStaticObstaclesTexture, vUv)) + texture2D(uWaterTexture, vUv);

    //read multiply texture and multiply
    vec4 tMultiply = texture2D(uMultiplyTexture, vUv);
    t *= tMultiply;

    //do offset with masking
    t += (1.0 - tMultiply) * uMaskOffset;

    gl_FragColor = t;
}