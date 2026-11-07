package com.imitaai.party;

import android.media.AudioManager;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Tela sempre acesa durante a partida (o celular passa de mão em mão).
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // Botões de volume controlam a mídia (e não o volume de chamada) mesmo depois de gravar.
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
    }
}
