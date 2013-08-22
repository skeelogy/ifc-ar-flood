//vertex shader that displaces vertices in Y based on a texture
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;
uniform vec2 uTexelSize;
uniform vec2 uTexelWorldSize;
uniform float uHeightMultiplier;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;

void main() {

    vUv = uv;

    //displace y based on texel value
    vec4 t = texture2D(uTexture, vUv) * uHeightMultiplier;
    vec3 displacedPos = vec3(position.x, t.r, position.z);

    //find normal
    vec4 tu = texture2D(uTexture, vUv + vec2(uTexelSize.r, 0)) * uHeightMultiplier;
    vec4 tv = texture2D(uTexture, vUv - vec2(0, uTexelSize.g)) * uHeightMultiplier;
    vec3 tangent = vec3(displacedPos.x+uTexelWorldSize.r, tu.r, displacedPos.z) - displacedPos;
    vec3 bitangent = vec3(displacedPos.x, tv.r, displacedPos.z+uTexelWorldSize.g) - displacedPos;
    vNormal = normalize(cross(bitangent, tangent));

    vec4 pos = vec4(displacedPos, 1.0);
    vWorldPos = (modelMatrix * pos).rgb;

    gl_Position = projectionMatrix * modelViewMatrix * pos;
}