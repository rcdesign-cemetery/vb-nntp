<?php
require_once DIR . '/includes/class_nntpgate_index_base.php';

/**
 *
 */
class NNTPGate_Forum_Index extends NNTPGate_Index_Base
{
    const MESSAGE_TYPE = 'forum';

    /**
     *
     * @access public
     * @param array $vbphrase
     * @param string $threadtitle
     * @param string $prefixid
     */
    public function make_message_title($vbphrase, $threadtitle = '', $prefixid = '')
    {
        if( empty($prefixid) OR empty($threadtitle))
        {
            $sql = "SELECT
                        `prefixid`, `title`
                    FROM
                        `" . TABLE_PREFIX . "thread`
                    WHERE
                        `threadid` = " . $this->_parent_id;
            $row = $this->_db->query_first($sql);
            if( !empty( $row ) )
            {
                $prefixid = $row['prefixid'];
                $threadtitle = $row['title'];
            }
        }

        if( !empty( $prefixid ) )
        {
            $prefixid = 'prefix_' . $prefixid . '_title_plain';
            $prefix   = $vbphrase["$prefixid"] . ' ';
        }
        $this->set_title($prefix . $threadtitle);
    }
    

    /**
     *
     *
     * @access public
     * @param array $value
     */
    public function set_post($value)
    {
        $this->_post = $value;
    }


    /**
     * Get message for cache
     *
     * @global vB_Registry $vbulletin
     * @return string
     */
    protected function _make_message_body()
    {
        $message = '';

        if (!intval($this->_post_id))
        {
            return $message;
        }
        $post =  $this->_post;
        $post['pagetext'] = $this->_post['message'];
        $post['allowsmilie'] = $post['enablesmilies'];
        // get for attachments
        $attachs = $this->_db->query_read_slave("
    			SELECT dateline, thumbnail_dateline, filename, filesize, visible, attachmentid, counter,
        			IF(thumbnail_filesize > 0, 1, 0) AS hasthumbnail, thumbnail_filesize,
            		attachmenttype.thumbnail AS build_thumbnail, attachmenttype.newwindow
                FROM " . TABLE_PREFIX . "attachment
                LEFT JOIN " . TABLE_PREFIX . "attachmenttype AS attachmenttype USING (extension)
                WHERE postid = $this->_post_id
                ORDER BY attachmentid");
    	while ($attachment = $this->_db->fetch_array($attachs))
        {
            if (!$attachment['build_thumbnail'])
            {
                $attachment['hasthumbnail'] = false;
    		}
            $postattach[$attachment['attachmentid']] = $attachment;
        }
        $post['attachments'] = $postattach;
        
        global $vbulletin, $foruminfo, $threadinfo;
        $userinfo = fetch_userinfo($post['userid']);
        require_once(DIR . '/includes/class_postbit.php');
        $postbit_factory =& new vB_Postbit_Factory();
        $postbit_factory->registry =& $vbulletin;
        $postbit_factory->forum =& $foruminfo;
        $postbit_factory->thread =& $threadinfo;
        $postbit_factory->cache = array();
        $postbit_factory->bbcode_parser =& new vB_BbCodeParser($vbulletin, fetch_tag_list());
        $postbit_factory->bbcode_parser->set_parse_userinfo($userinfo);
        $postbit_obj =& $postbit_factory->fetch_postbit('post');

        // вместо construct_postbit
        $postbit_obj->post = &$post;
        global $show, $vbphrase, $stylevar;
        $tmp_show = $show;
        $tmp_stylevar = $stylevar;
        $session_url = $vbulletin->session->vars['sessionurl'];
        $vbulletin->session->vars['sessionurl'] = '';

        $postbit_obj->parse_bbcode();
        $postbit_obj->process_attachments();

        eval('$message = "' . fetch_template('postbit_nntp') . '";');
        $show = $tmp_show;
        $stylevar = $tmp_stylevar;
        $vbulletin->session->vars['sessionurl'] = $session_url;
        return $message;
    }

    

    /**
     * Get message type
     *
     * @return string
     */
    protected function _get_message_type()
    {
        return self::MESSAGE_TYPE;
    }
}
