//Fragment shader to set colors on a render target
//author: Skeel Lee <skeel@skeelogy.com>

uniform vec4 uColor;

void main() {
    gl_FragColor = uColor;
}